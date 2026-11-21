-- =====================================================================
-- 0057: Survivor pools — 3 to 20 players, one pick per match day, last one standing wins the pot.
--   Everyone pays the same stake. Each match day (an Addis Ababa calendar day with at least 4 matches) every
--   player still alive picks ONE team to win; picks stay hidden until the day's first kickoff, then everyone's
--   picks show. A team that wins = you survive; a draw or a loss, or no pick = you are out. A team can only be
--   used once. A postponed or cancelled match = you survive and the team is not used up.
--   The last player standing gets their stake back + 90% of the others' stakes (same fair-fee maths as
--   challenges). If everyone left is out on the same day, or after the last day (default 7), the players still
--   in at the start of that day share. A pool that never starts is refunded.
-- Money moves only as wallet_ledger rows (entry_fee / payout / refund). Everything is server-side.
-- =====================================================================

create table if not exists public.survivor_pools (
  id           bigint generated always as identity primary key,
  code         text not null unique,
  creator_id   uuid not null references public.profiles (id) on delete restrict,
  stake_units  numeric(12,2) not null check (stake_units >= 1 and stake_units <= 50),
  min_players  int not null default 3 check (min_players between 2 and 20),
  max_players  int not null default 20 check (max_players between 2 and 20),
  fee_pct      numeric(4,3) not null default 0.100 check (fee_pct >= 0 and fee_pct < 1),
  max_days     int not null default 7 check (max_days between 2 and 14),
  status       text not null default 'open' check (status in ('open', 'live', 'settled', 'refunded', 'cancelled')),
  current_day  date,          -- the match day players are picking for / playing (null = waiting for the next match day)
  last_day     date,          -- the last match day that was settled
  days_played  int not null default 0,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '3 days'),
  started_at   timestamptz,
  settled_at   timestamptz
);
create index if not exists survivor_pools_status_idx on public.survivor_pools (status, expires_at);

create table if not exists public.survivor_players (
  pool_id      bigint not null references public.survivor_pools (id) on delete cascade,
  user_id      uuid   not null references public.profiles (id) on delete restrict,
  joined_at    timestamptz not null default now(),
  alive        boolean not null default true,
  out_day      date,
  out_reason   text,
  payout_units numeric(12,2),
  primary key (pool_id, user_id)
);
create index if not exists survivor_players_user_idx on public.survivor_players (user_id);

create table if not exists public.survivor_picks (
  pool_id   bigint not null references public.survivor_pools (id) on delete cascade,
  user_id   uuid   not null references public.profiles (id) on delete restrict,
  day       date   not null,
  match_id  bigint not null references public.matches (id) on delete restrict,
  side      text   not null check (side in ('home', 'away')),
  team      text   not null,
  result    text   check (result in ('won', 'lost', 'void')),
  picked_at timestamptz not null default now(),
  primary key (pool_id, user_id, day)
);

alter table public.survivor_pools   enable row level security;
alter table public.survivor_players enable row level security;
alter table public.survivor_picks   enable row level security;
revoke all on public.survivor_pools, public.survivor_players, public.survivor_picks from anon, authenticated;

alter table public.wallet_ledger add column if not exists survivor_id bigint references public.survivor_pools (id);

-- ---------------------------------------------------------- helpers
create or replace function public.survivor_day_of(p_ts timestamptz) returns date
language sql immutable set search_path = public as $$ select (p_ts at time zone 'Africa/Addis_Ababa')::date $$;
revoke all on function public.survivor_day_of(timestamptz) from public, anon, authenticated;

create or replace function public.survivor_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_abc  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'SV-' || (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.survivor_pools where code = v_code);
  end loop;
  return v_code;
end $$;
revoke all on function public.survivor_code() from public, anon, authenticated;

-- The next match day (after p_after, or the first one) that has at least 4 matches, none started yet,
-- and a first kickoff more than an hour away. Test matches never count.
create or replace function public.survivor_next_day(p_after date) returns date
language sql stable security definer set search_path = public as $$
  select d from (
    select public.survivor_day_of(kickoff_at) as d,
           count(*) filter (where status = 'scheduled') as n_sched,
           count(*) filter (where status in ('live', 'finished')) as n_started,
           min(kickoff_at) as ko
      from public.matches
     where provider <> 'test' and status not in ('cancelled', 'postponed')
     group by 1) x
   where n_sched >= 4 and n_started = 0 and ko > now() + interval '1 hour' and (p_after is null or d > p_after)
   order by d
   limit 1
$$;
revoke all on function public.survivor_next_day(date) from public, anon, authenticated;

-- the lock of a match day = its first kickoff
create or replace function public.survivor_lock_at(p_day date) returns timestamptz
language sql stable security definer set search_path = public as $$
  select min(kickoff_at) from public.matches
   where provider <> 'test' and status not in ('cancelled', 'postponed') and public.survivor_day_of(kickoff_at) = p_day
$$;
revoke all on function public.survivor_lock_at(date) from public, anon, authenticated;

-- ---------------------------------------------------------- create / join / leave / start
create or replace function public.survivor_create(p_stake numeric, p_min_players int default 3, p_max_days int default 7)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_id   bigint;
  v_code text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then raise exception 'phone not verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and date_of_birth is not null) then raise exception 'date of birth missing'; end if;
  if p_stake is null or p_stake < 1 or p_stake > 50 or p_stake * 4 <> floor(p_stake * 4) then
    raise exception 'stake must be 200 to 10,000 ETB in steps of 50 ETB';
  end if;
  if p_min_players is null or p_min_players not between 2 and 20 then raise exception 'min players must be 2 to 20'; end if;
  if p_max_days is null or p_max_days not between 2 and 14 then raise exception 'days must be 2 to 14'; end if;
  if exists (select 1 from public.survivor_pools where creator_id = v_uid and status = 'open' and expires_at > now()) then
    raise exception 'you already have an open pool';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  v_code := public.survivor_code();
  insert into public.survivor_pools (code, creator_id, stake_units, min_players, max_days) values (v_code, v_uid, p_stake, p_min_players, p_max_days) returning id into v_id;
  insert into public.survivor_players (pool_id, user_id) values (v_id, v_uid);
  insert into public.wallet_ledger (user_id, amount_units, kind, survivor_id, reference, created_by)
  values (v_uid, -p_stake, 'entry_fee', v_id, 'Survivor pool ' || v_code || ' stake', v_uid);
  return v_code;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.survivor_create(numeric, int, int) from public, anon;
grant execute on function public.survivor_create(numeric, int, int) to authenticated;

create or replace function public.survivor_join(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r     public.survivor_pools;
  v_n   int;
  v_name text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then raise exception 'phone not verified'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and date_of_birth is not null) then raise exception 'date of birth missing'; end if;
  select * into r from public.survivor_pools where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'pool not found'; end if;
  if r.status <> 'open' or r.expires_at <= now() then raise exception 'this pool is closed'; end if;
  if exists (select 1 from public.survivor_players where pool_id = r.id and user_id = v_uid) then raise exception 'you already joined this pool'; end if;
  select count(*) into v_n from public.survivor_players where pool_id = r.id;
  if v_n >= r.max_players then raise exception 'this pool is full'; end if;

  perform 1 from public.profiles where id = v_uid for update;
  insert into public.survivor_players (pool_id, user_id) values (r.id, v_uid);
  insert into public.wallet_ledger (user_id, amount_units, kind, survivor_id, reference, created_by)
  values (v_uid, -r.stake_units, 'entry_fee', r.id, 'Survivor pool ' || r.code || ' stake', v_uid);
  select username into v_name from public.profiles where id = v_uid;
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.creator_id, 'survivor_join', '👥 ' || v_name || ' joined your Survivor pool',
          (v_n + 1) || ' players · pot ' || public.fmt_units(r.stake_units * (v_n + 1)) || ' Units.', '/survivor/' || r.code);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke all on function public.survivor_join(text) from public, anon;
grant execute on function public.survivor_join(text) to authenticated;

create or replace function public.survivor_refund_all(p_pool bigint, p_reason text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.survivor_pools; rec record;
begin
  select * into r from public.survivor_pools where id = p_pool for update;
  if r.id is null or r.status not in ('open', 'live') then return; end if;
  for rec in select user_id from public.survivor_players where pool_id = r.id loop
    insert into public.wallet_ledger (user_id, amount_units, kind, survivor_id, reference)
    values (rec.user_id, r.stake_units, 'refund', r.id, 'Survivor pool ' || r.code || ' ' || p_reason);
  end loop;
  update public.survivor_pools set status = 'cancelled', settled_at = now() where id = r.id;
end $$;
revoke all on function public.survivor_refund_all(bigint, text) from public, anon, authenticated;

create or replace function public.survivor_leave(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.survivor_pools;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.survivor_pools where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'pool not found'; end if;
  if r.status <> 'open' then raise exception 'this pool is closed'; end if;
  if not exists (select 1 from public.survivor_players where pool_id = r.id and user_id = v_uid) then raise exception 'you are not in this pool'; end if;
  if r.creator_id = v_uid then
    perform public.survivor_refund_all(r.id, 'cancelled');
  else
    insert into public.wallet_ledger (user_id, amount_units, kind, survivor_id, reference)
    values (v_uid, r.stake_units, 'refund', r.id, 'Survivor pool ' || r.code || ' left before the start');
    delete from public.survivor_players where pool_id = r.id and user_id = v_uid;
  end if;
end $$;
revoke all on function public.survivor_leave(text) from public, anon;
grant execute on function public.survivor_leave(text) to authenticated;

create or replace function public.survivor_start(p_code text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.survivor_pools; v_n int; v_day date; v_lock timestamptz;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.survivor_pools where code = upper(btrim(p_code)) for update;
  if r.id is null or r.creator_id is distinct from v_uid then raise exception 'pool not found'; end if;
  if r.status <> 'open' or r.expires_at <= now() then raise exception 'this pool is closed'; end if;
  select count(*) into v_n from public.survivor_players where pool_id = r.id;
  if v_n < r.min_players then raise exception 'need at least % players', r.min_players; end if;
  v_day := public.survivor_next_day(null);
  if v_day is null then raise exception 'no match day is available yet'; end if;
  v_lock := public.survivor_lock_at(v_day);
  update public.survivor_pools set status = 'live', current_day = v_day, started_at = now() where id = r.id;
  insert into public.notifications (user_id, kind, title, body, link)
  select p.user_id, 'survivor_start', '🛡️ Survivor pool started!',
         'Pick one team to win before ' || to_char(v_lock at time zone 'Africa/Addis_Ababa', 'Dy DD Mon HH24:MI') || ' EAT. If it doesn''t win, you''re out.', '/survivor/' || r.code
    from public.survivor_players p where p.pool_id = r.id and p.user_id <> v_uid;
end $$;
revoke all on function public.survivor_start(text) from public, anon;
grant execute on function public.survivor_start(text) to authenticated;

-- ---------------------------------------------------------- picking
create or replace function public.survivor_pick(p_code text, p_match_id bigint, p_side text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  r      public.survivor_pools;
  m      public.matches;
  v_team text;
  v_lock timestamptz;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_side not in ('home', 'away') then raise exception 'pick home or away'; end if;
  select * into r from public.survivor_pools where code = upper(btrim(p_code));
  if r.id is null or r.status <> 'live' or r.current_day is null then raise exception 'this pool is not picking now'; end if;
  if not exists (select 1 from public.survivor_players where pool_id = r.id and user_id = v_uid and alive) then raise exception 'you are not alive in this pool'; end if;
  v_lock := public.survivor_lock_at(r.current_day);
  if v_lock is null or now() >= v_lock then raise exception 'picks for this day are closed'; end if;
  select * into m from public.matches where id = p_match_id;
  if m.id is null or m.provider = 'test' or m.status <> 'scheduled' or public.survivor_day_of(m.kickoff_at) <> r.current_day then
    raise exception 'that match is not part of this day';
  end if;
  v_team := case when p_side = 'home' then m.home_team else m.away_team end;
  if exists (select 1 from public.survivor_picks where pool_id = r.id and user_id = v_uid and day < r.current_day and team = v_team and result = 'won') then
    raise exception 'you already used % in this pool', v_team;
  end if;
  insert into public.survivor_picks (pool_id, user_id, day, match_id, side, team)
  values (r.id, v_uid, r.current_day, m.id, p_side, v_team)
  on conflict (pool_id, user_id, day) do update set match_id = excluded.match_id, side = excluded.side, team = excluded.team, picked_at = now();
end $$;
revoke all on function public.survivor_pick(text, bigint, text) from public, anon;
grant execute on function public.survivor_pick(text, bigint, text) to authenticated;

-- ---------------------------------------------------------- settle (internal)
create or replace function public.survivor_settle(p_pool bigint, p_winners uuid[])
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.survivor_pools; v_n int; v_each numeric; w uuid;
begin
  select * into r from public.survivor_pools where id = p_pool;
  select count(*) into v_n from public.survivor_players where pool_id = r.id;
  v_each := public.fair_prize_each(r.stake_units, v_n, cardinality(p_winners), r.fee_pct);
  foreach w in array p_winners loop
    insert into public.wallet_ledger (user_id, amount_units, kind, survivor_id, reference)
    values (w, v_each, 'payout', r.id, 'Survivor pool ' || r.code || ' winnings');
    update public.survivor_players set payout_units = v_each, alive = true, out_day = null, out_reason = null where pool_id = r.id and user_id = w;
  end loop;
  insert into public.notifications (user_id, kind, title, body, link)
  select p.user_id, 'survivor_result', '📊 Survivor pool finished',
         'The pool is over. ' || (select string_agg(pr.username, ', ') from public.survivor_players pp join public.profiles pr on pr.id = pp.user_id where pp.pool_id = r.id and pp.user_id = any (p_winners)) || ' won. Better luck next time!',
         '/survivor/' || r.code
    from public.survivor_players p where p.pool_id = r.id and not (p.user_id = any (p_winners));
  update public.survivor_pools set status = 'settled', settled_at = now(), current_day = null where id = r.id;
end $$;
revoke all on function public.survivor_settle(bigint, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------- advance: resolve finished days, open the next one (internal)
create or replace function public.survivor_advance(p_pool bigint)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  r          public.survivor_pools;
  v_day      date;
  v_first    timestamptz;
  v_last     timestamptz;
  v_before   uuid[];
  v_survive  uuid[] := '{}';
  v_out      uuid[] := '{}';
  rec        record;
  v_won      boolean;
  v_next     date;
  v_lock     timestamptz;
  v_loops    int := 0;
begin
  select * into r from public.survivor_pools where id = p_pool for update;
  if r.id is null then return 'missing'; end if;
  if r.status = 'open' and r.expires_at <= now() then
    perform public.survivor_refund_all(r.id, 'cancelled: it did not start in time');
    return 'cancelled';
  end if;
  loop
    v_loops := v_loops + 1;
    exit when v_loops > 12;
    select * into r from public.survivor_pools where id = p_pool;
    if r.status <> 'live' then return r.status; end if;

    -- waiting for the next match day to appear in the fixtures
    if r.current_day is null then
      v_next := public.survivor_next_day(r.last_day);
      if v_next is null then return 'live'; end if;
      update public.survivor_pools set current_day = v_next where id = r.id;
      continue;
    end if;

    v_day := r.current_day;
    select min(kickoff_at), max(kickoff_at) into v_first, v_last
      from public.matches where provider <> 'test' and status not in ('cancelled', 'postponed') and public.survivor_day_of(kickoff_at) = v_day;
    -- the day is over when every match is finished/cancelled/postponed (or 8 hours after the last kickoff)
    if v_first is not null and (exists (select 1 from public.matches where provider <> 'test' and public.survivor_day_of(kickoff_at) = v_day and status in ('scheduled', 'live'))
                                 and now() < v_last + interval '8 hours') then
      return 'live';
    end if;

    -- resolve the day
    v_before := array(select user_id from public.survivor_players where pool_id = r.id and alive);
    v_survive := '{}'; v_out := '{}';
    for rec in
      select sp.user_id, pk.match_id, pk.side, pk.team, m.status as mstatus, m.actual_home_score as h, m.actual_away_score as a
        from public.survivor_players sp
        left join public.survivor_picks pk on pk.pool_id = sp.pool_id and pk.user_id = sp.user_id and pk.day = v_day
        left join public.matches m on m.id = pk.match_id
       where sp.pool_id = r.id and sp.alive
    loop
      if rec.match_id is null then
        v_out := v_out || rec.user_id;
        update public.survivor_players set out_reason = 'no pick' where pool_id = r.id and user_id = rec.user_id;
      elsif rec.mstatus = 'finished' and rec.h is not null and rec.a is not null then
        v_won := (rec.side = 'home' and rec.h > rec.a) or (rec.side = 'away' and rec.a > rec.h);
        update public.survivor_picks set result = case when v_won then 'won' else 'lost' end where pool_id = r.id and user_id = rec.user_id and day = v_day;
        if v_won then v_survive := v_survive || rec.user_id;
        else
          v_out := v_out || rec.user_id;
          update public.survivor_players set out_reason = rec.team || (case when rec.h = rec.a then ' drew' else ' lost' end) where pool_id = r.id and user_id = rec.user_id;
        end if;
      else
        -- postponed, cancelled or never finished: the pick is void and the player stays in
        update public.survivor_picks set result = 'void' where pool_id = r.id and user_id = rec.user_id and day = v_day;
        v_survive := v_survive || rec.user_id;
      end if;
    end loop;

    update public.survivor_pools set days_played = days_played + 1, last_day = v_day, current_day = null where id = r.id;

    if cardinality(v_survive) = 0 then
      -- everybody still in fell on the same day: they share
      perform public.survivor_settle(r.id, v_before);
      return 'settled';
    end if;
    update public.survivor_players set alive = false, out_day = v_day where pool_id = r.id and user_id = any (v_out);
    insert into public.notifications (user_id, kind, title, body, link)
    select sp.user_id, 'survivor_out', '💀 Survivor: you''re out',
           coalesce(sp.out_reason, 'Your pick did not win') || '. Thanks for playing!', '/survivor/' || r.code
      from public.survivor_players sp where sp.pool_id = r.id and sp.user_id = any (v_out);

    if cardinality(v_survive) = 1 then
      perform public.survivor_settle(r.id, v_survive);
      return 'settled';
    end if;
    if r.days_played + 1 >= r.max_days then
      perform public.survivor_settle(r.id, v_survive);
      return 'settled';
    end if;

    -- open the next match day
    v_next := public.survivor_next_day(v_day);
    if v_next is not null then
      update public.survivor_pools set current_day = v_next where id = r.id;
      v_lock := public.survivor_lock_at(v_next);
      insert into public.notifications (user_id, kind, title, body, link)
      select sp.user_id, 'survivor_day', '📅 Survivor: day ' || (r.days_played + 2) || ' is open',
             'You survived! Pick a new team to win before ' || to_char(v_lock at time zone 'Africa/Addis_Ababa', 'Dy DD Mon HH24:MI') || ' EAT. ' || cardinality(v_survive) || ' players are left.',
             '/survivor/' || r.code
        from public.survivor_players sp where sp.pool_id = r.id and sp.alive;
      return 'live';
    end if;
    return 'live';
  end loop;
  return 'live';
end $$;
revoke all on function public.survivor_advance(bigint) from public, anon, authenticated;

create or replace function public.settle_due_survivor()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare r record; v_n int := 0; v_s text;
begin
  for r in select id from public.survivor_pools where status in ('open', 'live') order by id loop
    v_s := public.survivor_advance(r.id);
    if v_s in ('settled', 'cancelled') then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.settle_due_survivor() from public, anon, authenticated;
grant execute on function public.settle_due_survivor() to service_role;

-- ---------------------------------------------------------- what the page sees
create or replace function public.survivor_state(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  r         public.survivor_pools;
  v_member  boolean;
  v_lock    timestamptz;
  v_locked  boolean := false;
  v_matches jsonb := '[]'::jsonb;
  v_players jsonb;
  v_history jsonb;
  v_mine    jsonb := null;
  v_used    text[] := '{}';
  v_creator text;
  v_alive   int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into r from public.survivor_pools where code = upper(btrim(p_code));
  if r.id is null then return null; end if;
  perform public.survivor_advance(r.id);
  select * into r from public.survivor_pools where id = r.id;
  v_member := exists (select 1 from public.survivor_players where pool_id = r.id and user_id = v_uid);
  select username into v_creator from public.profiles where id = r.creator_id;
  select count(*) into v_alive from public.survivor_players where pool_id = r.id and alive;

  if r.status = 'live' and r.current_day is not null then
    v_lock := public.survivor_lock_at(r.current_day);
    v_locked := v_lock is not null and now() >= v_lock;
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'competition', m.competition, 'home', m.home_team, 'away', m.away_team,
             'kickoff_ms', (extract(epoch from m.kickoff_at) * 1000)::bigint, 'status', m.status,
             'home_score', m.actual_home_score, 'away_score', m.actual_away_score) order by m.kickoff_at, m.id), '[]'::jsonb)
      into v_matches
      from public.matches m
     where m.provider <> 'test' and m.status not in ('cancelled', 'postponed') and public.survivor_day_of(m.kickoff_at) = r.current_day;
  end if;

  if v_member then
    select jsonb_build_object('match_id', pk.match_id, 'side', pk.side, 'team', pk.team) into v_mine
      from public.survivor_picks pk where pk.pool_id = r.id and pk.user_id = v_uid and pk.day = r.current_day;
    v_used := array(select team from public.survivor_picks where pool_id = r.id and user_id = v_uid and result = 'won');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'username', pr.username, 'alive', p.alive, 'out_day', p.out_day, 'out_reason', p.out_reason, 'payout', p.payout_units,
           'is_me', p.user_id = v_uid, 'is_creator', p.user_id = r.creator_id,
           'picked', exists (select 1 from public.survivor_picks x where x.pool_id = r.id and x.user_id = p.user_id and x.day = r.current_day),
           'pick_team', case when v_locked or p.user_id = v_uid then (select x.team from public.survivor_picks x where x.pool_id = r.id and x.user_id = p.user_id and x.day = r.current_day) end)
         order by p.alive desc, p.joined_at), '[]'::jsonb)
    into v_players
    from public.survivor_players p join public.profiles pr on pr.id = p.user_id where p.pool_id = r.id;

  -- picks of finished days (and of today once it is locked) are visible to everyone in the pool
  if v_member then
    select coalesce(jsonb_agg(jsonb_build_object('day', day, 'picks', picks) order by day), '[]'::jsonb) into v_history
      from (select pk.day, jsonb_agg(jsonb_build_object('username', pr.username, 'team', pk.team, 'result', pk.result) order by pr.username) as picks
              from public.survivor_picks pk join public.profiles pr on pr.id = pk.user_id
             where pk.pool_id = r.id and (pk.day is distinct from r.current_day or v_locked)
             group by pk.day) h;
  else
    v_history := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'code', r.code, 'status', r.status, 'stake_units', r.stake_units, 'min_players', r.min_players, 'max_players', r.max_players,
    'max_days', r.max_days, 'days_played', r.days_played, 'fee_pct', r.fee_pct, 'creator', v_creator,
    'is_creator', r.creator_id = v_uid, 'is_member', v_member,
    'expires_in_s', greatest(0, floor(extract(epoch from (r.expires_at - now()))))::int,
    'alive_count', v_alive, 'current_day', r.current_day, 'waiting_next_day', r.status = 'live' and r.current_day is null,
    'lock_ms', case when v_lock is null then null else (extract(epoch from v_lock) * 1000)::bigint end,
    'now_ms', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'locked', v_locked,
    'matches', case when v_member then v_matches else '[]'::jsonb end,
    'my_pick', v_mine, 'used_teams', to_jsonb(v_used), 'players', v_players, 'history', v_history);
end $$;
revoke all on function public.survivor_state(text) from public, anon;
grant execute on function public.survivor_state(text) to authenticated;

create or replace function public.survivor_my_pools()
returns table (code text, status text, stake_units numeric, players bigint, alive bigint, creator text, created_at timestamptz, my_alive boolean, my_payout numeric)
language sql stable security definer set search_path = public as $$
  select r.code, r.status, r.stake_units,
         (select count(*) from public.survivor_players x where x.pool_id = r.id),
         (select count(*) from public.survivor_players x where x.pool_id = r.id and x.alive),
         pr.username, r.created_at, p.alive, p.payout_units
    from public.survivor_players p
    join public.survivor_pools r on r.id = p.pool_id
    join public.profiles pr on pr.id = r.creator_id
   where p.user_id = auth.uid() and r.created_at > now() - interval '30 days'
   order by r.created_at desc
   limit 30;
$$;
revoke all on function public.survivor_my_pools() from public, anon;
grant execute on function public.survivor_my_pools() to authenticated;

-- ---------------------------------------------------------- wallet notifications know about Survivor pools
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
  if new.survivor_id is not null then
    select 'Survivor pool ' || code into v_round from public.survivor_pools where id = new.survivor_id;
    v_link := '/survivor/' || substr(v_round, 15);
  elsif new.royale_id is not null then
    select 'Quiz Royale ' || code into v_round from public.royale_rooms where id = new.royale_id;
    v_link := '/royale/' || substr(v_round, 13);
  elsif new.challenge_id is not null then
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
    if new.challenge_id is null and new.royale_id is null and new.survivor_id is null then
      v_link := case when new.league_id is not null then '/leagues' else '/results' end;
    end if;
  elsif new.kind = 'commission' then
    v_title := '🤝 Sales commission';
    v_body  := '+' || v_amt || ' from a player you invited (' ||
               coalesce(nullif(replace(new.reference, 'Sales commission · ', ''), ''), 'a game') || '). Thank you!';
    v_link  := '/sales';
    v_push  := false;
  elsif new.kind = 'refund' and new.reference like 'Withdrawal #% rejected' then
    v_title := '❌ ' || replace(new.reference, ' rejected', ' not sent');
    v_body  := '+' || v_amt || ' returned to your wallet.';
  elsif new.kind = 'refund' and new.reference like '%nobody else joined%' then
    v_title := '↩️ Stake refunded · ' || coalesce(v_round, 'your round') || coalesce(' (' || v_slip || ')', '');
    v_body  := 'Nobody else joined, so your stake was refunded in full: +' || v_amt || '.';
  elsif new.kind = 'refund' then
    v_title := '↩️ Units returned';
    v_body  := '+' || v_amt || ' back in your wallet' || coalesce(': ' || new.reference, '') || '.';
  elsif new.kind = 'adjustment' then
    v_title := case when new.amount_units > 0 then '➕ Units added' else '➖ Units deducted' end;
    v_body  := case when new.amount_units > 0 then '+' else '−' end || v_amt || coalesce(': ' || new.reference, '') || '.';
  elsif new.kind = 'entry_fee' and new.survivor_id is not null then
    v_title := '🛡️ You''re in: ' || v_round;
    v_body  := v_amt || ' stake locked. Pick one team to win each match day: if it doesn''t win, you''re out. The last one standing wins the pot.';
    v_push  := false;
  elsif new.kind = 'entry_fee' and new.royale_id is not null then
    v_title := '🧠 You''re in: ' || v_round;
    v_body  := v_amt || ' stake locked. The creator starts the game when enough players have joined.';
    v_push  := false;
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
revoke execute on function public.notify_ledger_entry() from public, anon, authenticated;

-- make the new functions visible to the API right away
notify pgrst, 'reload schema';
