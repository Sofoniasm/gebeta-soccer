-- =====================================================================
-- GebetaSoccer — Superbru game loop
--   * Default picks: a player who joined a round but forgot a match gets
--     the most popular pick for that match (or 1-0 to the home team if
--     nobody picked), marked as a default.
--   * Everyone's picks for a match become visible once it kicks off.
--   * Career: a player's history across all rounds they played.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

alter table public.predictions add column if not exists is_default boolean not null default false;

-- 1. Default picks for one round (called by the admin before settling)
create or replace function public.apply_default_picks(p_round_id bigint)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  m record;
  v_h smallint;
  v_a smallint;
  n int;
begin
  for m in
    select id from public.matches
     where round_id = p_round_id and kickoff_at <= now()
       and status not in ('postponed', 'cancelled')
  loop
    -- most popular real pick (ties → the lower-scoring one, then home-leaning)
    select predicted_home_score, predicted_away_score into v_h, v_a
      from public.predictions
     where match_id = m.id and not is_default
     group by predicted_home_score, predicted_away_score
     order by count(*) desc, predicted_home_score + predicted_away_score asc,
              predicted_home_score - predicted_away_score desc
     limit 1;
    if v_h is null then v_h := 1; v_a := 0; end if;

    insert into public.predictions (user_id, match_id, predicted_home_score, predicted_away_score, is_default)
    select e.user_id, m.id, v_h, v_a, true
      from public.round_entries e
     where e.round_id = p_round_id
       and not exists (select 1 from public.predictions p where p.user_id = e.user_id and p.match_id = m.id);
    get diagnostics n = row_count;
    v_count := v_count + n;
    v_h := null; v_a := null;
  end loop;
  return v_count;
end $$;
revoke execute on function public.apply_default_picks(bigint) from public, anon, authenticated;
grant  execute on function public.apply_default_picks(bigint) to service_role;

-- 2. Everyone's picks for a match — only after kickoff
create or replace function public.get_match_picks(p_match_id bigint)
returns table (username text, home smallint, away smallint, points numeric, is_default boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select pr.username, p.predicted_home_score, p.predicted_away_score,
         coalesce(p.points_earned,
                  case when m.status = 'finished'
                       then public.calc_points(p.predicted_home_score, p.predicted_away_score,
                                               m.actual_home_score, m.actual_away_score) end),
         p.is_default,
         p.user_id = auth.uid()
    from public.matches m
    join public.predictions p on p.match_id = m.id
    join public.profiles pr on pr.id = p.user_id
   where m.id = p_match_id
     and (m.kickoff_at <= now() or m.status <> 'scheduled')
   order by 4 desc nulls last, pr.username;
$$;
grant execute on function public.get_match_picks(bigint) to authenticated;

-- How many picks a match has (shown before kickoff, without revealing them)
create or replace function public.get_match_pick_count(p_match_id bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.predictions where match_id = p_match_id;
$$;
grant execute on function public.get_match_pick_count(bigint) to anon, authenticated;

-- 3. Career: every round the signed-in player entered
create or replace function public.get_my_career()
returns table (round_id bigint, round_name text, status text, played_at timestamptz,
               rank bigint, players bigint, points numeric, slam_points numeric,
               correct_results bigint, exact_scores bigint, close_picks bigint,
               predicted bigint, winnings_units numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  lb record;
  v_players bigint;
begin
  for r in
    select ro.id, ro.name, ro.status, coalesce(ro.settled_at, ro.created_at) as at
      from public.round_entries e join public.rounds ro on ro.id = e.round_id
     where e.user_id = auth.uid()
     order by ro.id desc
  loop
    select count(*) into v_players from public.round_entries where round_entries.round_id = r.id;
    select * into lb from public.get_round_leaderboard(r.id) x where x.is_me limit 1;
    return query select r.id, r.name, r.status, r.at,
      lb.rank, v_players, coalesce(lb.points, 0), coalesce(lb.slam_points, 0),
      coalesce(lb.correct_results, 0), coalesce(lb.exact_scores, 0), coalesce(lb.close_picks, 0),
      coalesce(lb.predicted, 0),
      coalesce((select sum(amount_units) from public.wallet_ledger w
                 where w.user_id = auth.uid() and w.kind = 'payout' and w.round_id = r.id), 0);
  end loop;
end $$;
grant execute on function public.get_my_career() to authenticated;
