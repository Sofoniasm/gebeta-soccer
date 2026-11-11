-- =====================================================================
-- GebetaSoccer — multiple betting slips per round
--   * A SLIP = 10 picks (one per match of the round). It can only be placed
--     when all 10 are filled; the entry fee is paid when it is placed.
--   * A player may place as many slips as they like (each paid separately);
--     every slip competes on its own: "laki #1", "laki #2".
--   * Placed slips can be edited for free until the round LOCKS, which is the
--     first kickoff of the round. After that: no new slips, no edits.
--   * No refunds once placed.
--   * Slip #1 is mirrored into `predictions`, so private leagues, the match
--     page history, career stats etc. keep using "your first slip".
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------- tables
create table if not exists public.slips (
  id           bigint generated always as identity primary key,
  round_id     bigint not null references public.rounds (id),
  user_id      uuid   not null references public.profiles (id) on delete cascade,
  slip_no      int    not null check (slip_no >= 1),
  slam_points  numeric(3,1) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (round_id, user_id, slip_no)
);
create index if not exists slips_round_idx on public.slips (round_id);
create index if not exists slips_user_idx on public.slips (user_id, round_id);

create table if not exists public.slip_picks (
  id             bigint generated always as identity unique,
  slip_id        bigint   not null references public.slips (id) on delete cascade,
  match_id       bigint   not null references public.matches (id) on delete cascade,
  home           smallint not null check (home between 0 and 20),
  away           smallint not null check (away between 0 and 20),
  points_earned  numeric(3,1),
  primary key (slip_id, match_id)
);
create index if not exists slip_picks_match_idx on public.slip_picks (match_id);

alter table public.wallet_ledger add column if not exists slip_id bigint references public.slips (id);

alter table public.slips enable row level security;
alter table public.slip_picks enable row level security;
drop policy if exists "read own slips" on public.slips;
create policy "read own slips" on public.slips for select to authenticated using (user_id = auth.uid());
drop policy if exists "read own slip picks" on public.slip_picks;
create policy "read own slip picks" on public.slip_picks for select to authenticated
  using (exists (select 1 from public.slips s where s.id = slip_id and s.user_id = auth.uid()));
revoke insert, update, delete, truncate, references, trigger on public.slips, public.slip_picks from anon, authenticated;

-- Players no longer write predictions directly (slips do it for them).
drop policy if exists "insert own prediction before kickoff" on public.predictions;
drop policy if exists "update own prediction before kickoff" on public.predictions;
revoke insert, update, delete on public.predictions from anon, authenticated;

-- ---------------------------------------------------------- lock time
-- A round locks at its FIRST kickoff.
create or replace function public.round_lock_at(p_round_id bigint)
returns timestamptz language sql stable security definer set search_path = public as $$
  select min(kickoff_at) from public.matches
   where round_id = p_round_id and status not in ('postponed', 'cancelled');
$$;
grant execute on function public.round_lock_at(bigint) to anon, authenticated;

create or replace function public.round_is_bettable(p_round_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rounds where id = p_round_id and status = 'open')
     and coalesce(public.round_lock_at(p_round_id) > now(), false);
$$;
grant execute on function public.round_is_bettable(bigint) to anon, authenticated;

-- ---------------------------------------------------------- helpers
-- Validate a set of 10 picks for a round; returns them as rows.
create or replace function public.validate_slip_picks(p_round_id bigint, p_picks jsonb)
returns table (match_id bigint, home smallint, away smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_need int;
  v_got  int;
begin
  if jsonb_typeof(p_picks) <> 'array' then raise exception 'picks must be a list'; end if;
  select count(*) into v_need from public.matches where round_id = p_round_id;
  if v_need <> 10 then raise exception 'round does not have 10 matches'; end if;

  select count(distinct (x ->> 'match_id')::bigint) into v_got
    from jsonb_array_elements(p_picks) x
    join public.matches m on m.id = (x ->> 'match_id')::bigint and m.round_id = p_round_id
   where (x ->> 'home') ~ '^\d{1,2}$' and (x ->> 'away') ~ '^\d{1,2}$'
     and (x ->> 'home')::int between 0 and 20 and (x ->> 'away')::int between 0 and 20;
  if v_got <> 10 or jsonb_array_length(p_picks) <> 10 then
    raise exception 'a slip needs a score for all 10 matches';
  end if;

  return query
    select (x ->> 'match_id')::bigint, (x ->> 'home')::smallint, (x ->> 'away')::smallint
      from jsonb_array_elements(p_picks) x;
end $$;
revoke execute on function public.validate_slip_picks(bigint, jsonb) from public, anon, authenticated;

-- Copy slip #1 into predictions (leagues, match history, career use it).
create or replace function public.mirror_first_slip(p_slip_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare s public.slips;
begin
  select * into s from public.slips where id = p_slip_id;
  if s.slip_no <> 1 then return; end if;
  insert into public.predictions (user_id, match_id, predicted_home_score, predicted_away_score, points_earned)
  select s.user_id, sp.match_id, sp.home, sp.away, sp.points_earned
    from public.slip_picks sp where sp.slip_id = s.id
  on conflict (user_id, match_id) do update
    set predicted_home_score = excluded.predicted_home_score,
        predicted_away_score = excluded.predicted_away_score,
        points_earned        = excluded.points_earned,
        is_default           = false;
end $$;
revoke execute on function public.mirror_first_slip(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------- place / edit
create or replace function public.place_slip(p_round_id bigint, p_picks jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_fee  numeric;
  v_name text;
  v_no   int;
  v_id   bigint;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
  select entry_fee_units, name into v_fee, v_name from public.rounds where id = p_round_id for update;
  if v_fee is null or not public.round_is_bettable(p_round_id) then raise exception 'round is closed'; end if;
  perform 1 from public.validate_slip_picks(p_round_id, p_picks);

  perform 1 from public.profiles where id = v_uid for update;   -- one placement at a time per player
  select coalesce(max(slip_no), 0) + 1 into v_no from public.slips where round_id = p_round_id and user_id = v_uid;

  insert into public.slips (round_id, user_id, slip_no) values (p_round_id, v_uid, v_no) returning id into v_id;
  insert into public.slip_picks (slip_id, match_id, home, away)
    select v_id, v.match_id, v.home, v.away from public.validate_slip_picks(p_round_id, p_picks) v;

  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, slip_id, reference, created_by)
  values (v_uid, -v_fee, 'entry_fee', p_round_id, v_id, 'Slip #' || v_no, v_uid);

  insert into public.round_entries (round_id, user_id) values (p_round_id, v_uid) on conflict do nothing;
  perform public.mirror_first_slip(v_id);
  return v_no;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke execute on function public.place_slip(bigint, jsonb) from public, anon;
grant  execute on function public.place_slip(bigint, jsonb) to authenticated;

create or replace function public.update_slip(p_slip_id bigint, p_picks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.slips;
begin
  select * into s from public.slips where id = p_slip_id and user_id = auth.uid() for update;
  if s.id is null then raise exception 'slip not found'; end if;
  if not public.round_is_bettable(s.round_id) then raise exception 'round is closed'; end if;
  perform 1 from public.validate_slip_picks(s.round_id, p_picks);

  delete from public.slip_picks where slip_id = s.id;
  insert into public.slip_picks (slip_id, match_id, home, away)
    select s.id, v.match_id, v.home, v.away from public.validate_slip_picks(s.round_id, p_picks) v;
  update public.slips set updated_at = now() where id = s.id;
  perform public.mirror_first_slip(s.id);
end $$;
revoke execute on function public.update_slip(bigint, jsonb) from public, anon;
grant  execute on function public.update_slip(bigint, jsonb) to authenticated;

-- The old "join first, predict later" flow is replaced by place_slip.
create or replace function public.enter_round(p_round_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'place a slip instead';
end $$;

-- ---------------------------------------------------------- pot
drop function if exists public.get_round_pool(bigint);
create or replace function public.get_round_pool(p_round_id bigint)
returns table (entrants bigint, pool_units numeric, prize_fund_units numeric, players bigint)
language sql stable security definer set search_path = public as $$
  select count(s.id),
         count(s.id) * r.entry_fee_units,
         round(count(s.id) * r.entry_fee_units * (1 - r.house_cut), 2),
         count(distinct s.user_id)
    from public.rounds r
    left join public.slips s on s.round_id = r.id
   where r.id = p_round_id
   group by r.id;
$$;
grant execute on function public.get_round_pool(bigint) to anon, authenticated;

-- ---------------------------------------------------------- leaderboard
drop function if exists public.get_round_leaderboard(bigint);
create or replace function public.get_round_leaderboard(p_round_id bigint)
returns table (rank bigint, username text, slip_no int, slips_count bigint, points numeric, slam_points numeric,
               correct_results bigint, exact_scores bigint, close_picks bigint, predicted bigint, is_me boolean, slip_id bigint)
language sql stable security definer set search_path = public as $$
  with sl as (
    select s.*, count(*) over (partition by s.user_id) as n from public.slips s where s.round_id = p_round_id
  ),
  picks as (
    select sl.id as slip_id, m.status, sp.points_earned, sp.home ph, sp.away pa, m.actual_home_score ah, m.actual_away_score aa,
           sp.match_id as pick
      from sl join public.matches m on m.round_id = p_round_id
      left join public.slip_picks sp on sp.slip_id = sl.id and sp.match_id = m.id
  ),
  s as (
    select slip_id,
           coalesce(sum(coalesce(points_earned, case when status = 'finished' then public.calc_points(ph, pa, ah, aa) end)), 0) as pts,
           count(*) filter (where status = 'finished' and public.calc_points(ph, pa, ah, aa) > 0) as correct,
           count(*) filter (where status = 'finished' and ph = ah and pa = aa) as ex,
           count(*) filter (where status = 'finished' and public.calc_points(ph, pa, ah, aa) = 1.5) as cl,
           coalesce(sum(case when status = 'finished' then coalesce(abs(ph - ah) + abs(pa - aa), 20) end), 0) as away,
           count(pick) as pred
      from picks group by slip_id
  )
  select rank() over (order by s.pts + public.slam_points(s.correct) desc, s.correct desc, s.ex desc, s.cl desc, s.away asc),
         pr.username, sl.slip_no, sl.n,
         s.pts + public.slam_points(s.correct), public.slam_points(s.correct),
         s.correct, s.ex, s.cl, s.pred, sl.user_id = auth.uid(), sl.id
    from s join sl on sl.id = s.slip_id join public.profiles pr on pr.id = sl.user_id
   order by 1, pr.username, sl.slip_no;
$$;
grant execute on function public.get_round_leaderboard(bigint) to anon, authenticated;

-- ---------------------------------------------------------- settlement
-- p_points: [{pick_id, points}]  p_slams: [{slip_id, slam_points}]
-- p_payouts: [{slip_id, units, rank}]
create or replace function public.settle_round_slips(
  p_round_id bigint, p_points jsonb, p_slams jsonb, p_payouts jsonb, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds;
  v_fund  numeric;
  v_paid  numeric;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'round not found'; end if;
  if v_round.status not in ('open', 'locked') then raise exception 'round already %', v_round.status; end if;
  if exists (select 1 from public.matches where round_id = p_round_id and status not in ('finished', 'cancelled', 'postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select prize_fund_units into v_fund from public.get_round_pool(p_round_id);
  select coalesce(sum((x ->> 'units')::numeric), 0) into v_paid from jsonb_array_elements(p_payouts) x;
  if v_paid > coalesce(v_fund, 0) + 0.001 then raise exception 'payouts (%) exceed prize fund (%)', v_paid, v_fund; end if;
  if exists (select 1 from jsonb_array_elements(p_payouts) x
              where not exists (select 1 from public.slips s where s.id = (x ->> 'slip_id')::bigint and s.round_id = p_round_id)) then
    raise exception 'payout to a slip outside this round';
  end if;

  update public.slip_picks sp set points_earned = (x ->> 'points')::numeric
    from jsonb_array_elements(p_points) x
   where sp.id = (x ->> 'pick_id')::bigint
     and sp.slip_id in (select id from public.slips where round_id = p_round_id);
  update public.slips s set slam_points = (x ->> 'slam_points')::numeric
    from jsonb_array_elements(p_slams) x
   where s.id = (x ->> 'slip_id')::bigint and s.round_id = p_round_id;

  -- keep slip #1 history in predictions / round_entries in step
  update public.predictions p set points_earned = sp.points_earned
    from public.slip_picks sp join public.slips s on s.id = sp.slip_id
   where s.round_id = p_round_id and s.slip_no = 1 and p.user_id = s.user_id and p.match_id = sp.match_id;
  update public.round_entries e set slam_points = s.slam_points
    from public.slips s where s.round_id = p_round_id and s.slip_no = 1 and e.round_id = p_round_id and e.user_id = s.user_id;

  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, slip_id, reference, created_by)
  select s.user_id, (x ->> 'units')::numeric, 'payout', p_round_id, s.id,
         'Slip #' || s.slip_no || ' winnings (Rank ' || coalesce(x ->> 'rank', '1') || ')', p_admin_id
    from jsonb_array_elements(p_payouts) x join public.slips s on s.id = (x ->> 'slip_id')::bigint
   where (x ->> 'units')::numeric > 0;

  update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
end $$;
revoke execute on function public.settle_round_slips(bigint, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.settle_round_slips(bigint, jsonb, jsonb, jsonb, uuid) to service_role;

-- ---------------------------------------------------------- picks after lock
drop function if exists public.get_match_picks(bigint);
create or replace function public.get_match_picks(p_match_id bigint)
returns table (username text, slip_no int, slips_count bigint, home smallint, away smallint, points numeric, is_default boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.matches where id = p_match_id),
  sl as (
    select s.*, count(*) over (partition by s.user_id) n from public.slips s join m on s.round_id = m.round_id
  )
  select pr.username, sl.slip_no, sl.n, sp.home, sp.away,
         coalesce(sp.points_earned, case when m.status = 'finished' then public.calc_points(sp.home, sp.away, m.actual_home_score, m.actual_away_score) end),
         false, sl.user_id = auth.uid()
    from m join sl on true
    join public.slip_picks sp on sp.slip_id = sl.id and sp.match_id = m.id
    join public.profiles pr on pr.id = sl.user_id
   where coalesce(public.round_lock_at(m.round_id), m.kickoff_at) <= now() or m.status <> 'scheduled'
   order by 6 desc nulls last, pr.username, sl.slip_no;
$$;
revoke execute on function public.get_match_picks(bigint) from public, anon;
grant  execute on function public.get_match_picks(bigint) to authenticated;

create or replace function public.get_match_pick_count(p_match_id bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.slip_picks where match_id = p_match_id;
$$;
grant execute on function public.get_match_pick_count(bigint) to anon, authenticated;

-- ---------------------------------------------------------- career (best slip per round)
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
    select distinct ro.id, ro.name, ro.status, coalesce(ro.settled_at, ro.created_at) as at
      from public.slips s join public.rounds ro on ro.id = s.round_id
     where s.user_id = auth.uid()
     order by ro.id desc
  loop
    select count(*) into v_players from public.slips where slips.round_id = r.id;
    select * into lb from public.get_round_leaderboard(r.id) x where x.is_me order by x.rank limit 1;
    return query select r.id, r.name, r.status, r.at,
      lb.rank, v_players, coalesce(lb.points, 0), coalesce(lb.slam_points, 0),
      coalesce(lb.correct_results, 0), coalesce(lb.exact_scores, 0), coalesce(lb.close_picks, 0),
      coalesce(lb.predicted, 0),
      coalesce((select sum(amount_units) from public.wallet_ledger w
                 where w.user_id = auth.uid() and w.kind = 'payout' and w.round_id = r.id and w.league_id is null), 0);
  end loop;
end $$;
revoke execute on function public.get_my_career() from public, anon;
grant  execute on function public.get_my_career() to authenticated;

create or replace function public.get_public_stats()
returns table (players bigint, predictions bigint, rounds bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.profiles),
         (select count(*) from public.slip_picks) + (select count(*) from public.predictions p
            where not exists (select 1 from public.slips s join public.matches m on m.round_id = s.round_id
                               where s.user_id = p.user_id and m.id = p.match_id)),
         (select count(*) from public.rounds where status = 'settled');
$$;
grant execute on function public.get_public_stats() to anon, authenticated;

-- Leagues are now played with each member's FIRST slip (mirrored into predictions).
-- Defaults only for main-round players who somehow lack a pick (legacy rounds).
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
    select id from public.matches where round_id = p_round_id and kickoff_at <= now() and status not in ('postponed', 'cancelled')
  loop
    select predicted_home_score, predicted_away_score into v_h, v_a
      from public.predictions where match_id = m.id and not is_default
     group by predicted_home_score, predicted_away_score
     order by count(*) desc, predicted_home_score + predicted_away_score asc, predicted_home_score - predicted_away_score desc
     limit 1;
    if v_h is null then v_h := 1; v_a := 0; end if;
    insert into public.predictions (user_id, match_id, predicted_home_score, predicted_away_score, is_default)
    select e.user_id, m.id, v_h, v_a, true from public.round_entries e
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

-- ---------------------------------------------------------- wallet notes
create or replace function public.notify_ledger_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bal   numeric;
  v_amt   text := public.fmt_units(new.amount_units) || ' Unit' ||
                  case when abs(new.amount_units) = 1 then '' else 's' end ||
                  ' (' || public.fmt_etb(new.amount_units) || ' ETB)';
  v_title text;
  v_body  text;
  v_link  text := '/wallet';
  v_push  boolean := true;
  v_round text;
  v_slip  text;
begin
  select balance_units into v_bal from public.profiles where id = new.user_id;
  if new.league_id is not null then
    select 'league “' || name || '”' into v_round from public.leagues where id = new.league_id;
  else
    select coalesce(nullif(trim(name), ''), 'Round ' || id) into v_round from public.rounds where id = new.round_id;
  end if;
  if new.slip_id is not null then
    select 'Slip #' || slip_no into v_slip from public.slips where id = new.slip_id;
  end if;

  if new.kind = 'deposit' then
    v_title := '💰 Deposit received';
    v_body  := '+' || v_amt || ' added to your wallet.';
  elsif new.kind = 'payout' then
    v_title := '🏆 You won!';
    v_body  := '+' || v_amt || ' from ' || coalesce(v_round, 'your round') || coalesce(' (' || v_slip || ')', '') || '. Congratulations!';
    v_link  := case when new.league_id is not null then '/leagues' else '/results' end;
  elsif new.kind = 'refund' and new.reference like 'Withdrawal #% rejected' then
    v_title := '❌ ' || replace(new.reference, ' rejected', ' not sent');
    v_body  := '+' || v_amt || ' returned to your wallet.';
  elsif new.kind = 'refund' then
    v_title := '↩️ Units returned';
    v_body  := '+' || v_amt || ' back in your wallet' || coalesce(' — ' || new.reference, '') || '.';
  elsif new.kind = 'adjustment' then
    v_title := case when new.amount_units > 0 then '➕ Units added' else '➖ Units deducted' end;
    v_body  := case when new.amount_units > 0 then '+' else '−' end || v_amt || coalesce(' — ' || new.reference, '') || '.';
  elsif new.kind = 'entry_fee' then
    v_title := case when v_slip is not null then '🎟️ ' || v_slip || ' placed · ' || coalesce(v_round, 'the round')
                    else '⚽ You joined ' || coalesce(v_round, 'the round') end;
    v_body  := v_amt || ' paid. You can edit your picks until the first kickoff. Good luck!';
    v_link  := case when new.league_id is not null then '/leagues' else '/dashboard' end;
    v_push  := new.created_by is distinct from new.user_id;
  elsif new.kind = 'withdrawal' then
    v_title := '⏳ Withdrawal requested';
    v_body  := v_amt || ' is on hold for you. We''ll send it to your Telebirr soon.';
    v_push  := false;
  else
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, push)
  values (new.user_id, new.kind, v_title, v_body || ' Balance: ' || public.fmt_units(coalesce(v_bal, 0)) || ' Units.', v_link, v_push);
  return new;
end $$;

-- ---------------------------------------------------------- backfill
-- Existing round entries become Slip #1 with the picks the player already made.
insert into public.slips (round_id, user_id, slip_no, slam_points, created_at)
select e.round_id, e.user_id, 1, e.slam_points, e.created_at
  from public.round_entries e
 where not exists (select 1 from public.slips s where s.round_id = e.round_id and s.user_id = e.user_id);

insert into public.slip_picks (slip_id, match_id, home, away, points_earned)
select s.id, p.match_id, p.predicted_home_score, p.predicted_away_score, p.points_earned
  from public.slips s
  join public.matches m on m.round_id = s.round_id
  join public.predictions p on p.user_id = s.user_id and p.match_id = m.id
 where s.slip_no = 1
on conflict (slip_id, match_id) do nothing;

-- (old entry-fee rows stay as they are: the wallet ledger is append-only)

revoke execute on function public.round_lock_at(bigint) from public;
grant  execute on function public.round_lock_at(bigint) to anon, authenticated;
