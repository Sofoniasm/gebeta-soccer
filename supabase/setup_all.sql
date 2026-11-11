-- GebetaSoccer: full database setup (0001 + 0002 + 0003 combined)
-- Paste ALL of this into Supabase → SQL Editor → New query → Run. Run it ONCE.


-- ===================== migrations/0001_init.sql =====================
-- =====================================================================
-- GebetaSoccer — initial schema
-- Run this once in Supabase → SQL Editor → New query → Run.
--
-- Design principles
--   * Money is NEVER edited directly. Every change is a row in
--     wallet_ledger; profiles.balance_units is a cache maintained by a
--     trigger and can never go below zero.
--   * Browsers (anon / authenticated roles) can only read their own data
--     and write their own predictions before kickoff. Everything that
--     touches money runs as service_role from server code.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text unique not null check (char_length(username) between 3 and 24),
  phone_number   text unique,
  balance_units  numeric(12,2) not null default 0 check (balance_units >= 0),
  is_admin       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- A round = one weekly set of (usually 10) matches with a shared prize pool.
create table public.rounds (
  id               bigint generated always as identity primary key,
  name             text not null,
  status           text not null default 'open'
                   check (status in ('draft','open','locked','settled','cancelled')),
  entry_fee_units  numeric(12,2) not null default 1 check (entry_fee_units > 0),
  house_cut        numeric(4,3) not null default 0.300 check (house_cut >= 0 and house_cut < 1),
  created_at       timestamptz not null default now(),
  settled_at       timestamptz
);

create table public.matches (
  id                 bigint generated always as identity primary key,
  external_id        bigint unique,              -- football-data.org match id
  round_id           bigint references public.rounds (id) on delete set null,
  competition        text,
  home_team          text not null,
  away_team          text not null,
  home_crest         text,
  away_crest         text,
  kickoff_at         timestamptz not null,
  status             text not null default 'scheduled'
                     check (status in ('scheduled','live','finished','postponed','cancelled')),
  actual_home_score  smallint check (actual_home_score >= 0),
  actual_away_score  smallint check (actual_away_score >= 0),
  updated_at         timestamptz not null default now()
);
create index matches_round_idx   on public.matches (round_id);
create index matches_kickoff_idx on public.matches (kickoff_at);

-- Paying the entry fee for a round creates one row here.
create table public.round_entries (
  round_id    bigint not null references public.rounds (id) on delete cascade,
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table public.predictions (
  id                    bigint generated always as identity primary key,
  user_id               uuid   not null references public.profiles (id) on delete cascade,
  match_id              bigint not null references public.matches (id) on delete cascade,
  predicted_home_score  smallint not null check (predicted_home_score between 0 and 20),
  predicted_away_score  smallint not null check (predicted_away_score between 0 and 20),
  points_earned         numeric(3,1),           -- set only by settlement
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, match_id)
);

-- Append-only money log. Positive = credit, negative = debit.
create table public.wallet_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete restrict,
  amount_units  numeric(12,2) not null check (amount_units <> 0),
  kind          text not null check (kind in
                ('deposit','withdrawal','entry_fee','payout','refund','adjustment')),
  round_id      bigint references public.rounds (id),
  reference     text,                           -- e.g. Telebirr txn id, admin note
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
create index wallet_ledger_user_idx on public.wallet_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. Triggers
-- ---------------------------------------------------------------------

-- Keep profiles.balance_units in sync with the ledger.
-- The CHECK (balance_units >= 0) makes any overdraft fail the whole
-- transaction, so a user can never spend money they do not have.
create function public.apply_ledger_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set balance_units = balance_units + new.amount_units
   where id = new.user_id;
  return new;
end $$;

create trigger wallet_ledger_apply
after insert on public.wallet_ledger
for each row execute function public.apply_ledger_entry();

-- The ledger is append-only: block edits and deletes for everyone.
create function public.block_ledger_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'wallet_ledger is append-only; insert a correcting entry instead';
end $$;

create trigger wallet_ledger_no_update before update or delete on public.wallet_ledger
for each row execute function public.block_ledger_changes();

-- Create a profile automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, phone_number)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'player_' || substr(replace(new.id::text, '-', ''), 1, 8)),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone_number')
  );
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Keep predictions.updated_at fresh.
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger predictions_touch before update on public.predictions
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.rounds        enable row level security;
alter table public.matches       enable row level security;
alter table public.round_entries enable row level security;
alter table public.predictions   enable row level security;
alter table public.wallet_ledger enable row level security;

-- profiles: read your own; may only change your username.
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant  update (username) on public.profiles to authenticated;

-- rounds & matches: public, read-only.
create policy "anyone reads rounds"  on public.rounds  for select to anon, authenticated using (true);
create policy "anyone reads matches" on public.matches for select to anon, authenticated using (true);

-- round_entries: read your own. Joining happens through enter_round().
create policy "read own entries" on public.round_entries
  for select to authenticated using (user_id = auth.uid());

-- wallet_ledger: read your own history. No writes from the browser.
create policy "read own ledger" on public.wallet_ledger
  for select to authenticated using (user_id = auth.uid());

-- predictions: read your own; insert/update only if you entered the
-- round, the round is open, and the match has not kicked off.
create policy "read own predictions" on public.predictions
  for select to authenticated using (user_id = auth.uid());

create policy "insert own prediction before kickoff" on public.predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.matches m
        join public.rounds r         on r.id = m.round_id
        join public.round_entries e  on e.round_id = r.id and e.user_id = auth.uid()
       where m.id = match_id
         and r.status = 'open'
         and m.status = 'scheduled'
         and m.kickoff_at > now()
    )
  );

create policy "update own prediction before kickoff" on public.predictions
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.matches m
        join public.rounds r on r.id = m.round_id
       where m.id = match_id
         and r.status = 'open'
         and m.status = 'scheduled'
         and m.kickoff_at > now()
    )
  );

-- Browsers may only write the score columns — never points_earned.
revoke insert, update on public.predictions from authenticated, anon;
grant insert (user_id, match_id, predicted_home_score, predicted_away_score)
  on public.predictions to authenticated;
grant update (predicted_home_score, predicted_away_score)
  on public.predictions to authenticated;

-- ---------------------------------------------------------------------
-- 4. Functions (RPC)
-- ---------------------------------------------------------------------

-- Public: prize pool for a round (for the landing page).
create function public.get_round_pool(p_round_id bigint)
returns table (entrants bigint, pool_units numeric, prize_fund_units numeric)
language sql stable security definer set search_path = public as $$
  select count(e.user_id),
         count(e.user_id) * r.entry_fee_units,
         round(count(e.user_id) * r.entry_fee_units * (1 - r.house_cut), 2)
    from public.rounds r
    left join public.round_entries e on e.round_id = r.id
   where r.id = p_round_id
   group by r.id;
$$;
grant execute on function public.get_round_pool(bigint) to anon, authenticated;

-- Logged-in user: pay the entry fee and join an open round.
-- Fails (and charges nothing) if the balance is too low.
create function public.enter_round(p_round_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_fee numeric;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select entry_fee_units into v_fee
    from public.rounds where id = p_round_id and status = 'open' for update;
  if v_fee is null then raise exception 'round is not open'; end if;

  insert into public.round_entries (round_id, user_id) values (p_round_id, v_uid);
  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, reference, created_by)
  values (v_uid, -v_fee, 'entry_fee', p_round_id, 'Round entry', v_uid);
exception
  when unique_violation then raise exception 'already entered this round';
  when check_violation  then raise exception 'insufficient balance';
end $$;
revoke execute on function public.enter_round(bigint) from public, anon;
grant  execute on function public.enter_round(bigint) to authenticated;

-- Server only: credit a manual deposit (e.g. Telebirr confirmed in Telegram).
create function public.admin_add_units(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_units <= 0 then raise exception 'units must be positive'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, p_units, 'deposit', p_reference, p_admin_id);
end $$;
revoke execute on function public.admin_add_units(uuid, numeric, text, uuid) from public, anon, authenticated;
grant  execute on function public.admin_add_units(uuid, numeric, text, uuid) to service_role;

-- Server only: write points + payouts and close the round in ONE transaction.
--   p_points  = [{"prediction_id": 1, "points": 3}, ...]
--   p_payouts = [{"user_id": "...", "units": 5.6}, ...]
create function public.settle_round(
  p_round_id bigint, p_points jsonb, p_payouts jsonb, p_admin_id uuid
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

  -- Never pay out more than the prize fund.
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

  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, reference, created_by)
  select (x ->> 'user_id')::uuid, (x ->> 'units')::numeric, 'payout', p_round_id,
         'Round ' || p_round_id || ' winnings', p_admin_id
    from jsonb_array_elements(p_payouts) x
   where (x ->> 'units')::numeric > 0;

  update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
end $$;
revoke execute on function public.settle_round(bigint, jsonb, jsonb, uuid) from public, anon, authenticated;
grant  execute on function public.settle_round(bigint, jsonb, jsonb, uuid) to service_role;

-- ===================== migrations/0002_match_provider.sql =====================
-- Tag every match with the data source it came from, so match ids from
-- different providers (football-data, API-Football, ...) never clash.
alter table public.matches add column provider text not null default 'football-data';
alter table public.matches drop constraint matches_external_id_key;
alter table public.matches add constraint matches_provider_external_id_key unique (provider, external_id);

-- ===================== migrations/0003_auth_profile.sql =====================
-- Store email on the profile, enforce case-insensitive unique usernames,
-- and let the sign-up form check username / phone availability.

alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

-- Backfill email for anyone who signed up before this migration.
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, phone_number, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'player_' || substr(replace(new.id::text, '-', ''), 1, 8)),
    coalesce(new.phone, nullif(new.raw_user_meta_data ->> 'phone_number', '')),
    new.email
  );
  return new;
end $$;

-- Returns only true/false — never reveals who owns a username or phone.
create or replace function public.check_signup_available(p_username text, p_phone text)
returns table (username_taken boolean, phone_taken boolean)
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.profiles where lower(username) = lower(p_username)),
    exists (select 1 from public.profiles where phone_number = p_phone);
$$;
grant execute on function public.check_signup_available(text, text) to anon, authenticated;
