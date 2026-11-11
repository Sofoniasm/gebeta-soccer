-- =====================================================================
-- GebetaSoccer — Superbru-style scoring
--   * Close = right result AND (1 goal away, OR 2 goals away with the
--     same goal difference — e.g. pick 1-1, ends 2-2)
--   * Slam Points per round: 5-7 correct results +1, 8-9 +2, 10+ +3
--   * Tie-breaks: points → correct results → exact scores → close picks
--     → smallest total goals away
-- Run once in Supabase → SQL Editor.
-- =====================================================================

-- 1. Per-match points (mirror of lib/scoring.ts)
create or replace function public.calc_points(ph int, pa int, ah int, aa int)
returns numeric language sql immutable as $$
  select case
    when ph is null or pa is null or ah is null or aa is null then null
    when ph = ah and pa = aa then 3
    when sign(ph - pa) <> sign(ah - aa) then 0
    when abs(ph - ah) + abs(pa - aa) = 1 then 1.5
    when abs(ph - ah) + abs(pa - aa) = 2 and (ph - pa) = (ah - aa) then 1.5
    else 1
  end::numeric;
$$;

create or replace function public.slam_points(correct bigint)
returns numeric language sql immutable as $$
  select case when correct >= 10 then 3 when correct >= 8 then 2 when correct >= 5 then 1 else 0 end::numeric;
$$;

-- 2. Store each player's Slam Points when a round is settled
alter table public.round_entries add column if not exists slam_points numeric(3,1) not null default 0;

-- 3. Settlement now also records Slam Points
drop function if exists public.settle_round(bigint, jsonb, jsonb, uuid);
create or replace function public.settle_round(
  p_round_id bigint, p_points jsonb, p_payouts jsonb, p_admin_id uuid, p_slams jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round      public.rounds;
  v_prize_fund numeric;
  v_total_paid numeric;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'round not found'; end if;
  if v_round.status not in ('open','locked') then
    raise exception 'round already %', v_round.status;
  end if;

  if exists (select 1 from public.matches
              where round_id = p_round_id
                and status not in ('finished','cancelled','postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select prize_fund_units into v_prize_fund from public.get_round_pool(p_round_id);
  select coalesce(sum((x ->> 'units')::numeric), 0) into v_total_paid
    from jsonb_array_elements(p_payouts) x;
  if v_total_paid > v_prize_fund then
    raise exception 'payouts (%) exceed prize fund (%)', v_total_paid, v_prize_fund;
  end if;

  update public.predictions p
     set points_earned = (x ->> 'points')::numeric
    from jsonb_array_elements(p_points) x
   where p.id = (x ->> 'prediction_id')::bigint;

  update public.round_entries e
     set slam_points = (x ->> 'slam_points')::numeric
    from jsonb_array_elements(p_slams) x
   where e.round_id = p_round_id and e.user_id = (x ->> 'user_id')::uuid;

  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, reference, created_by)
  select (x ->> 'user_id')::uuid, (x ->> 'units')::numeric, 'payout', p_round_id,
         'Round ' || p_round_id || ' winnings', p_admin_id
    from jsonb_array_elements(p_payouts) x
   where (x ->> 'units')::numeric > 0;

  update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
end $$;
revoke execute on function public.settle_round(bigint, jsonb, jsonb, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.settle_round(bigint, jsonb, jsonb, uuid, jsonb) to service_role;

-- 4. Live round leaderboard with Slam Points and Superbru tie-breaks
drop function if exists public.get_round_leaderboard(bigint);
create or replace function public.get_round_leaderboard(p_round_id bigint)
returns table (rank bigint, username text, points numeric, slam_points numeric, correct_results bigint,
               exact_scores bigint, close_picks bigint, predicted bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with e as (
    select user_id from public.round_entries where round_id = p_round_id
  ),
  picks as (
    select e.user_id, m.status, p.id as pid, p.points_earned,
           p.predicted_home_score ph, p.predicted_away_score pa,
           m.actual_home_score ah, m.actual_away_score aa
      from e
      cross join public.matches m
      left join public.predictions p on p.user_id = e.user_id and p.match_id = m.id
     where m.round_id = p_round_id
  ),
  s as (
    select user_id,
           coalesce(sum(coalesce(points_earned,
                    case when status = 'finished' then public.calc_points(ph, pa, ah, aa) end)), 0) as pts,
           count(*) filter (where status = 'finished' and public.calc_points(ph, pa, ah, aa) > 0) as correct,
           count(*) filter (where status = 'finished' and ph = ah and pa = aa) as ex,
           count(*) filter (where status = 'finished' and public.calc_points(ph, pa, ah, aa) = 1.5) as cl,
           coalesce(sum(case when status = 'finished' then
                      coalesce(abs(ph - ah) + abs(pa - aa), 20) end), 0) as away,
           count(pid) as pred
      from picks group by user_id
  )
  select rank() over (order by s.pts + public.slam_points(s.correct) desc, s.correct desc, s.ex desc, s.cl desc, s.away asc),
         pr.username,
         s.pts + public.slam_points(s.correct),
         public.slam_points(s.correct),
         s.correct, s.ex, s.cl, s.pred,
         s.user_id = auth.uid()
    from s join public.profiles pr on pr.id = s.user_id
   order by 1, pr.username;
$$;
grant execute on function public.get_round_leaderboard(bigint) to anon, authenticated;

-- 5. All-time table now includes Slam Points
drop function if exists public.get_overall_leaderboard(int);
create or replace function public.get_overall_leaderboard(p_limit int default 100)
returns table (rank bigint, username text, rounds_played bigint, points numeric, exact_scores bigint, wins bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with played as (
    select e.user_id, count(*) as rounds, sum(e.slam_points) as slams
      from public.round_entries e join public.rounds r on r.id = e.round_id
     where r.status = 'settled'
     group by e.user_id
  ),
  pts as (
    select p.user_id,
           sum(p.points_earned) as points,
           count(*) filter (where p.points_earned = 3) as ex
      from public.predictions p
      join public.matches m on m.id = p.match_id
      join public.rounds r on r.id = m.round_id and r.status = 'settled'
     group by p.user_id
  ),
  wins as (
    select user_id, count(distinct round_id) as wins
      from public.wallet_ledger where kind = 'payout' group by user_id
  )
  select rank() over (order by coalesce(pts.points, 0) + coalesce(played.slams, 0) desc, coalesce(pts.ex, 0) desc),
         pr.username, played.rounds, coalesce(pts.points, 0) + coalesce(played.slams, 0), coalesce(pts.ex, 0),
         coalesce(wins.wins, 0), played.user_id = auth.uid()
    from played
    join public.profiles pr on pr.id = played.user_id
    left join pts  on pts.user_id  = played.user_id
    left join wins on wins.user_id = played.user_id
   order by 1, pr.username
   limit greatest(p_limit, 1);
$$;
grant execute on function public.get_overall_leaderboard(int) to anon, authenticated;
