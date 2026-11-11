-- =====================================================================
-- 0021: Winning bar, bigger deposits, private challenges
--   1. Main pool: a slip only wins with MORE than half the match points
--      (Slam Points not counted). Nobody above the bar = house keeps the pool.
--   2. Deposits: 5-500 Units (1,000-100,000 ETB) per transaction.
--   3. Private challenges: pick 1-10 matches, set any stake, share a link.
--      Everyone who joins pays the same stake. Highest score wins the pot
--      minus 10%; ties share. Nobody joined by the first kickoff = refund.
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------- 1. deposits
create or replace function public.admin_add_units(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_units is null or p_units < 5 then raise exception 'minimum deposit is 5 units (1,000 ETB)'; end if;
  if p_units > 500 then raise exception 'maximum is 500 units (100,000 ETB) per transaction'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'player not found'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, p_units, 'deposit', coalesce(nullif(trim(p_reference), ''), 'Telegram deposit'), p_admin_id);
end $$;
revoke execute on function public.admin_add_units(uuid, numeric, text, uuid) from public, anon, authenticated;
grant  execute on function public.admin_add_units(uuid, numeric, text, uuid) to service_role;

-- ---------------------------------------------------------- 2. winning bar
-- The server works out the payouts; the database double-checks the bar so
-- a slip at or below half the match points can never be paid.
create or replace function public.settle_round_slips(
  p_round_id bigint, p_points jsonb, p_slams jsonb, p_payouts jsonb, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds;
  v_fund  numeric;
  v_paid  numeric;
  v_bar   numeric;
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

  -- winning bar: more than half of 3 points x finished matches
  v_bar := 1.5 * (select count(*) from public.matches where round_id = p_round_id and status = 'finished');
  if exists (
    select 1 from jsonb_array_elements(p_payouts) x
     where (x ->> 'units')::numeric > 0
       and (select coalesce(sum(sp.points_earned), 0) from public.slip_picks sp where sp.slip_id = (x ->> 'slip_id')::bigint) <= v_bar
  ) then
    raise exception 'a winning slip needs more than % match points', v_bar;
  end if;

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

-- ---------------------------------------------------------- 3. challenges
create table if not exists public.challenges (
  id           bigint generated always as identity primary key,
  code         text not null unique,
  creator_id   uuid not null references public.profiles (id) on delete restrict,
  title        text not null check (char_length(title) between 3 and 60),
  stake_units  numeric(12,2) not null check (stake_units >= 1 and stake_units <= 5000),
  max_players  int check (max_players is null or max_players between 2 and 100),
  fee_pct      numeric(4,3) not null default 0.100 check (fee_pct >= 0 and fee_pct < 1),
  status       text not null default 'open' check (status in ('open', 'settled', 'refunded', 'cancelled')),
  lock_at      timestamptz not null,
  prize_units  numeric(12,2),
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);
create index if not exists challenges_status_idx on public.challenges (status, lock_at);

create table if not exists public.challenge_matches (
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  match_id     bigint not null references public.matches (id) on delete restrict,
  primary key (challenge_id, match_id)
);

create table if not exists public.challenge_entries (
  id            bigint generated always as identity unique,
  challenge_id  bigint not null references public.challenges (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete restrict,
  joined_at     timestamptz not null default now(),
  points        numeric(6,2),
  correct       int,
  exact         int,
  close_picks   int,
  goals_away    int,
  rank          int,
  payout_units  numeric(12,2),
  primary key (challenge_id, user_id)
);
create index if not exists challenge_entries_user_idx on public.challenge_entries (user_id);

create table if not exists public.challenge_picks (
  entry_id  bigint not null references public.challenge_entries (id) on delete cascade,
  match_id  bigint not null references public.matches (id) on delete restrict,
  home      smallint not null check (home between 0 and 20),
  away      smallint not null check (away between 0 and 20),
  points    numeric(4,2),
  primary key (entry_id, match_id)
);

alter table public.wallet_ledger add column if not exists challenge_id bigint references public.challenges (id);

-- Everything is read and written through the functions below.
alter table public.challenges        enable row level security;
alter table public.challenge_matches enable row level security;
alter table public.challenge_entries enable row level security;
alter table public.challenge_picks   enable row level security;
revoke all on public.challenges, public.challenge_matches, public.challenge_entries, public.challenge_picks from anon, authenticated;

-- ---- helpers ------------------------------------------------------------
create or replace function public.challenge_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_abc  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'GC-' || (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1), '')
                          from generate_series(1, 6));
    exit when not exists (select 1 from public.challenges where code = v_code);
  end loop;
  return v_code;
end $$;
revoke execute on function public.challenge_code() from public, anon, authenticated;

-- Picks for a challenge: one score (0-20) for every one of its matches.
create or replace function public.validate_challenge_picks(p_challenge_id bigint, p_picks jsonb)
returns table (match_id bigint, home smallint, away smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_need int;
  v_got  int;
begin
  if jsonb_typeof(p_picks) <> 'array' then raise exception 'picks must be a list'; end if;
  select count(*) into v_need from public.challenge_matches where challenge_id = p_challenge_id;
  select count(distinct (x ->> 'match_id')::bigint) into v_got
    from jsonb_array_elements(p_picks) x
    join public.challenge_matches cm on cm.match_id = (x ->> 'match_id')::bigint and cm.challenge_id = p_challenge_id
   where (x ->> 'home') ~ '^\d{1,2}$' and (x ->> 'away') ~ '^\d{1,2}$'
     and (x ->> 'home')::int between 0 and 20 and (x ->> 'away')::int between 0 and 20;
  if v_need = 0 or v_got <> v_need or jsonb_array_length(p_picks) <> v_need then
    raise exception 'enter a score for every match in the challenge';
  end if;
  return query
    select (x ->> 'match_id')::bigint, (x ->> 'home')::smallint, (x ->> 'away')::smallint
      from jsonb_array_elements(p_picks) x;
end $$;
revoke execute on function public.validate_challenge_picks(bigint, jsonb) from public, anon, authenticated;

-- ---- settle / refund (runs on its own when a challenge is due) ------------
create or replace function public.settle_challenge_if_due(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c          public.challenges;
  v_players  int;
  v_counted  int;
  v_pot      numeric;
  v_prize_c  bigint;
  v_winners  int;
  v_each     numeric;
begin
  select * into c from public.challenges where id = p_id for update;
  if c.id is null or c.status <> 'open' or c.lock_at > now() then return null; end if;
  select count(*) into v_players from public.challenge_entries where challenge_id = c.id;

  -- Nobody joined before the first kickoff: give the creator the stake back.
  if v_players < 2 then
    insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference)
    select user_id, c.stake_units, 'refund', c.id, 'Challenge ' || c.code || ': nobody joined'
      from public.challenge_entries where challenge_id = c.id;
    update public.challenges set status = 'refunded', settled_at = now() where id = c.id;
    return 'refunded';
  end if;

  -- Wait until every match is over (finished with a score, or called off).
  if exists (
    select 1 from public.challenge_matches cm join public.matches m on m.id = cm.match_id
     where cm.challenge_id = c.id
       and not (m.status in ('cancelled', 'postponed')
                or (m.status = 'finished' and m.actual_home_score is not null and m.actual_away_score is not null))
  ) then
    return null;
  end if;

  select count(*) into v_counted
    from public.challenge_matches cm join public.matches m on m.id = cm.match_id
   where cm.challenge_id = c.id and m.status = 'finished';

  -- Every match called off: everyone gets their stake back.
  if v_counted = 0 then
    insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference)
    select user_id, c.stake_units, 'refund', c.id, 'Challenge ' || c.code || ': matches called off'
      from public.challenge_entries where challenge_id = c.id;
    update public.challenges set status = 'refunded', settled_at = now() where id = c.id;
    return 'refunded';
  end if;

  -- Score every pick (same 3 / 1.5 / 1 / 0 rules; called-off matches score 0).
  update public.challenge_picks p
     set points = case when m.status = 'finished'
                       then public.calc_points(p.home, p.away, m.actual_home_score, m.actual_away_score) else 0 end
    from public.challenge_entries e, public.matches m
   where e.id = p.entry_id and e.challenge_id = c.id and m.id = p.match_id;

  update public.challenge_entries e set
    points      = t.pts,
    correct     = t.correct,
    exact       = t.exact,
    close_picks = t.close_n,
    goals_away  = t.away
  from (
    select p.entry_id,
           coalesce(sum(p.points), 0) pts,
           count(*) filter (where p.points > 0) correct,
           count(*) filter (where p.points = 3) exact,
           count(*) filter (where p.points = 1.5) close_n,
           coalesce(sum(abs(p.home - m.actual_home_score) + abs(p.away - m.actual_away_score)) filter (where m.status = 'finished'), 0) away
      from public.challenge_picks p
      join public.challenge_entries e2 on e2.id = p.entry_id and e2.challenge_id = c.id
      join public.matches m on m.id = p.match_id
     group by p.entry_id
  ) t
  where e.id = t.entry_id;

  -- Rank: points, then correct results, exact scores, close picks, fewest goals away.
  update public.challenge_entries e set rank = r.rk
    from (
      select id, rank() over (order by points desc, correct desc, exact desc, close_picks desc, goals_away asc) rk
        from public.challenge_entries where challenge_id = c.id
    ) r
   where e.id = r.id;

  -- Pot minus the fee, shared equally by everyone in first place (rounded down to 0.01).
  v_pot := c.stake_units * v_players;
  v_prize_c := floor(v_pot * (1 - c.fee_pct) * 100);
  select count(*) into v_winners from public.challenge_entries where challenge_id = c.id and rank = 1;
  v_each := floor(v_prize_c::numeric / v_winners) / 100;

  update public.challenge_entries set payout_units = case when rank = 1 then v_each else 0 end
   where challenge_id = c.id;
  insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference)
  select user_id, v_each, 'payout', c.id, 'Challenge ' || c.code || ' winnings'
    from public.challenge_entries where challenge_id = c.id and rank = 1 and v_each > 0;

  insert into public.notifications (user_id, kind, title, body, link)
  select e.user_id, 'challenge_result', '📊 Challenge “' || c.title || '” finished',
         'You finished #' || e.rank || ' of ' || v_players || ' with ' || public.fmt_units(e.points) || ' points. Better luck next time!',
         '/challenges/' || c.code
    from public.challenge_entries e where e.challenge_id = c.id and e.rank > 1;

  update public.challenges set status = 'settled', settled_at = now(), prize_units = v_each * v_winners where id = c.id;
  return 'settled';
end $$;
revoke execute on function public.settle_challenge_if_due(bigint) from public, anon, authenticated;

-- Settle / refund everything that is due (called after each match sync).
create or replace function public.settle_due_challenges() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_n  int := 0;
begin
  for v_id in select id from public.challenges where status = 'open' and lock_at <= now() order by lock_at loop
    if public.settle_challenge_if_due(v_id) is not null then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.settle_due_challenges() from public, anon, authenticated;
grant  execute on function public.settle_due_challenges() to service_role;

-- ---- player actions -----------------------------------------------------
create or replace function public.create_challenge(p_title text, p_stake numeric, p_max_players int, p_picks jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_n     int;
  v_ok    int;
  v_lock  timestamptz;
  v_id    bigint;
  v_code  text;
  v_entry bigint;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 3 and 60 then raise exception 'name must be 3 to 60 characters'; end if;
  if p_stake is null or p_stake < 1 or p_stake > 5000 or p_stake * 4 <> floor(p_stake * 4) then
    raise exception 'stake must be 200 to 1,000,000 ETB in steps of 50 ETB';
  end if;
  if p_max_players is not null and p_max_players not between 2 and 100 then raise exception 'max players must be 2 to 100'; end if;
  if jsonb_typeof(p_picks) <> 'array' then raise exception 'picks must be a list'; end if;

  v_n := jsonb_array_length(p_picks);
  if v_n < 1 or v_n > 10 then raise exception 'pick 1 to 10 matches'; end if;
  select count(distinct m.id), min(m.kickoff_at) into v_ok, v_lock
    from jsonb_array_elements(p_picks) x
    join public.matches m on m.id = (x ->> 'match_id')::bigint
   where m.status = 'scheduled' and m.kickoff_at > now() + interval '5 minutes'
     and (x ->> 'home') ~ '^\d{1,2}$' and (x ->> 'away') ~ '^\d{1,2}$'
     and (x ->> 'home')::int between 0 and 20 and (x ->> 'away')::int between 0 and 20;
  if v_ok <> v_n then raise exception 'every match must be upcoming and have a score'; end if;

  perform 1 from public.profiles where id = v_uid for update;
  v_code := public.challenge_code();
  insert into public.challenges (code, creator_id, title, stake_units, max_players, lock_at)
  values (v_code, v_uid, trim(p_title), p_stake, p_max_players, v_lock) returning id into v_id;
  insert into public.challenge_matches (challenge_id, match_id)
    select v_id, (x ->> 'match_id')::bigint from jsonb_array_elements(p_picks) x;
  insert into public.challenge_entries (challenge_id, user_id) values (v_id, v_uid) returning id into v_entry;
  insert into public.challenge_picks (entry_id, match_id, home, away)
    select v_entry, v.match_id, v.home, v.away from public.validate_challenge_picks(v_id, p_picks) v;

  insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference, created_by)
  values (v_uid, -p_stake, 'entry_fee', v_id, 'Challenge ' || v_code || ' stake', v_uid);
  return v_code;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke execute on function public.create_challenge(text, numeric, int, jsonb) from public, anon;
grant  execute on function public.create_challenge(text, numeric, int, jsonb) to authenticated;

create or replace function public.join_challenge(p_code text, p_picks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  c       public.challenges;
  v_n     int;
  v_entry bigint;
  v_name  text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
  select * into c from public.challenges where code = upper(trim(p_code)) for update;
  if c.id is null then raise exception 'challenge not found'; end if;
  if c.status <> 'open' or c.lock_at <= now() then raise exception 'this challenge is closed'; end if;
  if exists (select 1 from public.challenge_entries where challenge_id = c.id and user_id = v_uid) then
    raise exception 'you already joined this challenge';
  end if;
  select count(*) into v_n from public.challenge_entries where challenge_id = c.id;
  if c.max_players is not null and v_n >= c.max_players then raise exception 'this challenge is full'; end if;
  perform 1 from public.validate_challenge_picks(c.id, p_picks);

  perform 1 from public.profiles where id = v_uid for update;
  insert into public.challenge_entries (challenge_id, user_id) values (c.id, v_uid) returning id into v_entry;
  insert into public.challenge_picks (entry_id, match_id, home, away)
    select v_entry, v.match_id, v.home, v.away from public.validate_challenge_picks(c.id, p_picks) v;
  insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference, created_by)
  values (v_uid, -c.stake_units, 'entry_fee', c.id, 'Challenge ' || c.code || ' stake', v_uid);

  select username into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, kind, title, body, link)
  values (c.creator_id, 'challenge_join', '👥 ' || v_name || ' joined “' || c.title || '”',
          (v_n + 1) || ' players · pot ' || public.fmt_units(c.stake_units * (v_n + 1)) || ' Units ('
          || public.fmt_etb(c.stake_units * (v_n + 1)) || ' ETB).', '/challenges/' || c.code);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke execute on function public.join_challenge(text, jsonb) from public, anon;
grant  execute on function public.join_challenge(text, jsonb) to authenticated;

create or replace function public.update_challenge_picks(p_code text, p_picks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  c       public.challenges;
  v_entry bigint;
begin
  select * into c from public.challenges where code = upper(trim(p_code));
  if c.id is null then raise exception 'challenge not found'; end if;
  if c.status <> 'open' or c.lock_at <= now() then raise exception 'this challenge is closed'; end if;
  select id into v_entry from public.challenge_entries where challenge_id = c.id and user_id = auth.uid();
  if v_entry is null then raise exception 'you are not in this challenge'; end if;
  perform 1 from public.validate_challenge_picks(c.id, p_picks);
  delete from public.challenge_picks where entry_id = v_entry;
  insert into public.challenge_picks (entry_id, match_id, home, away)
    select v_entry, v.match_id, v.home, v.away from public.validate_challenge_picks(c.id, p_picks) v;
end $$;
revoke execute on function public.update_challenge_picks(text, jsonb) from public, anon;
grant  execute on function public.update_challenge_picks(text, jsonb) to authenticated;

-- The creator can call it off (and get the stake back) only while nobody else has joined.
create or replace function public.cancel_challenge(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.challenges;
begin
  select * into c from public.challenges where code = upper(trim(p_code)) for update;
  if c.id is null or c.creator_id is distinct from auth.uid() then raise exception 'challenge not found'; end if;
  if c.status <> 'open' or c.lock_at <= now() then raise exception 'this challenge is closed'; end if;
  if (select count(*) from public.challenge_entries where challenge_id = c.id) > 1 then
    raise exception 'someone already joined, so it can''t be cancelled';
  end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, challenge_id, reference, created_by)
  values (c.creator_id, c.stake_units, 'refund', c.id, 'Challenge ' || c.code || ' cancelled', c.creator_id);
  update public.challenges set status = 'cancelled', settled_at = now() where id = c.id;
end $$;
revoke execute on function public.cancel_challenge(text) from public, anon;
grant  execute on function public.cancel_challenge(text) to authenticated;

-- ---- reading ------------------------------------------------------------
-- One call returns everything the page needs. Anyone signed in with the code
-- sees the challenge, its matches and who is in. Other players' picks appear
-- only after the first kickoff.
create or replace function public.get_challenge(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c        public.challenges;
  v_uid    uuid := auth.uid();
  v_member boolean;
  v_locked boolean;
  v_out    jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into c from public.challenges where code = upper(trim(p_code));
  if c.id is null then return null; end if;
  perform public.settle_challenge_if_due(c.id);
  select * into c from public.challenges where id = c.id;

  v_member := exists (select 1 from public.challenge_entries where challenge_id = c.id and user_id = v_uid);
  v_locked := c.lock_at <= now() or c.status <> 'open';

  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'title', c.title, 'stake_units', c.stake_units,
    'max_players', c.max_players, 'fee_pct', c.fee_pct, 'status', c.status,
    'lock_at', c.lock_at, 'prize_units', c.prize_units, 'created_at', c.created_at,
    'creator', (select username from public.profiles where id = c.creator_id),
    'is_creator', c.creator_id = v_uid,
    'is_member', v_member,
    'locked', v_locked,
    'players', (select count(*) from public.challenge_entries where challenge_id = c.id),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'home_team', m.home_team, 'away_team', m.away_team,
               'home_crest', m.home_crest, 'away_crest', m.away_crest,
               'competition', m.competition, 'kickoff_at', m.kickoff_at, 'status', m.status,
               'home_score', m.actual_home_score, 'away_score', m.actual_away_score)
             order by m.kickoff_at, m.id)
        from public.challenge_matches cm join public.matches m on m.id = cm.match_id
       where cm.challenge_id = c.id), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'username', p.username, 'is_me', e.user_id = v_uid, 'joined_at', e.joined_at,
               'points', coalesce(e.points, live.pts), 'rank', e.rank, 'payout_units', e.payout_units,
               'picks', case when v_locked or e.user_id = v_uid then (
                   select jsonb_agg(jsonb_build_object('match_id', cp.match_id, 'home', cp.home, 'away', cp.away,
                            'points', coalesce(cp.points, case when m2.status = 'finished'
                              then public.calc_points(cp.home, cp.away, m2.actual_home_score, m2.actual_away_score) end)))
                     from public.challenge_picks cp join public.matches m2 on m2.id = cp.match_id
                    where cp.entry_id = e.id) end)
             order by coalesce(e.points, live.pts) desc nulls last, e.joined_at)
        from public.challenge_entries e
        join public.profiles p on p.id = e.user_id
        left join lateral (
          select sum(public.calc_points(cp.home, cp.away, m3.actual_home_score, m3.actual_away_score)) pts
            from public.challenge_picks cp join public.matches m3 on m3.id = cp.match_id
           where cp.entry_id = e.id and m3.status = 'finished' and v_locked
        ) live on true
       where e.challenge_id = c.id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.get_challenge(text) from public, anon;
grant  execute on function public.get_challenge(text) to authenticated;

create or replace function public.get_my_challenges()
returns table (code text, title text, stake_units numeric, status text, lock_at timestamptz,
               players bigint, max_players int, is_creator boolean, my_rank int, my_payout numeric, matches bigint)
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  for v_id in select c.id from public.challenges c join public.challenge_entries e on e.challenge_id = c.id
               where e.user_id = auth.uid() and c.status = 'open' and c.lock_at <= now() loop
    perform public.settle_challenge_if_due(v_id);
  end loop;
  return query
    select c.code, c.title, c.stake_units, c.status, c.lock_at,
           (select count(*) from public.challenge_entries x where x.challenge_id = c.id),
           c.max_players, c.creator_id = auth.uid(), e.rank, e.payout_units,
           (select count(*) from public.challenge_matches x where x.challenge_id = c.id)
      from public.challenges c join public.challenge_entries e on e.challenge_id = c.id and e.user_id = auth.uid()
     order by (c.status = 'open') desc, c.lock_at desc
     limit 100;
end $$;
revoke execute on function public.get_my_challenges() from public, anon;
grant  execute on function public.get_my_challenges() to authenticated;

-- ---- wallet notifications know about challenges ------------------------
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
  v_ch    public.challenges;
begin
  select balance_units into v_bal from public.profiles where id = new.user_id;
  if new.challenge_id is not null then
    select * into v_ch from public.challenges where id = new.challenge_id;
    v_round := 'challenge “' || v_ch.title || '”';
    v_link  := '/challenges/' || v_ch.code;
  elsif new.league_id is not null then
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
    if new.challenge_id is null then
      v_link := case when new.league_id is not null then '/leagues' else '/results' end;
    end if;
  elsif new.kind = 'refund' and new.reference like 'Withdrawal #% rejected' then
    v_title := '❌ ' || replace(new.reference, ' rejected', ' not sent');
    v_body  := '+' || v_amt || ' returned to your wallet.';
  elsif new.kind = 'refund' then
    v_title := '↩️ Units returned';
    v_body  := '+' || v_amt || ' back in your wallet' || coalesce(': ' || new.reference, '') || '.';
  elsif new.kind = 'adjustment' then
    v_title := case when new.amount_units > 0 then '➕ Units added' else '➖ Units deducted' end;
    v_body  := case when new.amount_units > 0 then '+' else '−' end || v_amt || coalesce(': ' || new.reference, '') || '.';
  elsif new.kind = 'entry_fee' and new.challenge_id is not null then
    v_title := '🤝 You''re in: ' || v_round;
    v_body  := v_amt || ' stake locked. You can change your scores until the first kickoff.';
    v_push  := new.created_by is distinct from new.user_id;
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
