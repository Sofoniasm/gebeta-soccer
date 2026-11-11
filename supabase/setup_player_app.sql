-- GebetaSoccer: player app update (0006 + 0007 combined)
-- Paste ALL of this into Supabase → SQL Editor → Run. Safe to run once.

-- =====================================================================
-- GebetaSoccer — player app: leaderboards, deposit & withdrawal requests
-- Run once in Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Scoring in SQL (mirror of lib/scoring.ts) — used for LIVE leaderboards
-- while a round is still in progress.
-- ---------------------------------------------------------------------
create or replace function public.calc_points(ph int, pa int, ah int, aa int)
returns numeric language sql immutable as $$
  select case
    when ph is null or pa is null or ah is null or aa is null then null
    when ph = ah and pa = aa then 3
    when sign(ph - pa) <> sign(ah - aa) then 0
    when (ph - pa) = (ah - aa) or abs(ph - ah) + abs(pa - aa) = 1 then 1.5
    else 1
  end::numeric;
$$;

-- ---------------------------------------------------------------------
-- Round leaderboard (live). Shows usernames + points only — never ids,
-- phones or emails. Uses settled points when available, otherwise
-- calculates from finished matches so far.
-- ---------------------------------------------------------------------
create or replace function public.get_round_leaderboard(p_round_id bigint)
returns table (rank bigint, username text, points numeric, exact_scores bigint, predicted bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with e as (
    select user_id from public.round_entries where round_id = p_round_id
  ),
  s as (
    select e.user_id,
           coalesce(sum(coalesce(p.points_earned,
                    case when m.status = 'finished'
                         then public.calc_points(p.predicted_home_score, p.predicted_away_score,
                                                 m.actual_home_score, m.actual_away_score) end)), 0) as pts,
           count(*) filter (where m.status = 'finished'
                              and p.predicted_home_score = m.actual_home_score
                              and p.predicted_away_score = m.actual_away_score) as ex,
           count(p.id) as pred
      from e
      left join public.matches m on m.round_id = p_round_id
      left join public.predictions p on p.user_id = e.user_id and p.match_id = m.id
     group by e.user_id
  )
  select rank() over (order by s.pts desc, s.ex desc) as rank,
         pr.username, s.pts, s.ex, s.pred,
         s.user_id = auth.uid() as is_me
    from s join public.profiles pr on pr.id = s.user_id
   order by 1, pr.username;
$$;
grant execute on function public.get_round_leaderboard(bigint) to anon, authenticated;

-- All-time table across settled rounds.
create or replace function public.get_overall_leaderboard(p_limit int default 100)
returns table (rank bigint, username text, rounds_played bigint, points numeric, exact_scores bigint, wins bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with played as (
    select e.user_id, count(*) as rounds
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
  select rank() over (order by coalesce(pts.points, 0) desc, coalesce(pts.ex, 0) desc),
         pr.username, played.rounds, coalesce(pts.points, 0), coalesce(pts.ex, 0),
         coalesce(wins.wins, 0), played.user_id = auth.uid()
    from played
    join public.profiles pr on pr.id = played.user_id
    left join pts  on pts.user_id  = played.user_id
    left join wins on wins.user_id = played.user_id
   order by 1, pr.username
   limit greatest(p_limit, 1);
$$;
grant execute on function public.get_overall_leaderboard(int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Deposit requests: the player reports a Telebirr payment; the admin
-- approves it (which credits the wallet through the ledger).
-- ---------------------------------------------------------------------
create table if not exists public.deposit_requests (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  amount_etb   numeric(12,2) not null check (amount_etb >= 1 and amount_etb <= 1000000),
  method       text not null default 'telebirr' check (method in ('telebirr', 'cbe_birr', 'bank')),
  reference    text not null check (char_length(reference) between 4 and 64),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note   text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users (id),
  unique (method, reference)                     -- the same receipt can't be claimed twice
);
create index if not exists deposit_requests_status_idx on public.deposit_requests (status, created_at);
alter table public.deposit_requests enable row level security;

create policy "read own deposit requests" on public.deposit_requests
  for select to authenticated using (user_id = auth.uid());
create policy "create own deposit request" on public.deposit_requests
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
revoke insert, update, delete on public.deposit_requests from authenticated, anon;
grant insert (amount_etb, method, reference) on public.deposit_requests to authenticated;

-- ---------------------------------------------------------------------
-- Withdrawal requests: units are taken from the wallet immediately
-- (held), so they can't be spent twice. If the admin rejects, they are
-- refunded through the ledger.
-- ---------------------------------------------------------------------
create table if not exists public.withdrawal_requests (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  units         numeric(12,2) not null check (units >= 1),
  payout_phone  text not null,
  status        text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  admin_note    text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  processed_by  uuid references auth.users (id)
);
create index if not exists withdrawal_requests_status_idx on public.withdrawal_requests (status, created_at);
alter table public.withdrawal_requests enable row level security;
create policy "read own withdrawal requests" on public.withdrawal_requests
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.withdrawal_requests from authenticated, anon;

create or replace function public.request_withdrawal(p_units numeric, p_phone text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  bigint;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_units is null or p_units < 1 then raise exception 'minimum withdrawal is 1 unit'; end if;
  if p_phone is null or p_phone !~ '^\+251[79][0-9]{8}$' then raise exception 'invalid phone'; end if;
  if (select count(*) from public.withdrawal_requests where user_id = v_uid and status = 'pending') >= 3 then
    raise exception 'too many pending withdrawals';
  end if;

  insert into public.withdrawal_requests (user_id, units, payout_phone)
  values (v_uid, p_units, p_phone) returning id into v_id;

  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (v_uid, -p_units, 'withdrawal', 'Withdrawal request #' || v_id, v_uid);
  return v_id;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
revoke execute on function public.request_withdrawal(numeric, text) from public, anon;
grant  execute on function public.request_withdrawal(numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Admin-only (server) functions for the admin console (built later).
-- ---------------------------------------------------------------------
create or replace function public.admin_approve_deposit(p_request_id bigint, p_units numeric, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.deposit_requests;
begin
  select * into r from public.deposit_requests where id = p_request_id for update;
  if r.id is null then raise exception 'request not found'; end if;
  if r.status <> 'pending' then raise exception 'request already %', r.status; end if;
  if p_units is null or p_units <= 0 then raise exception 'units must be positive'; end if;

  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (r.user_id, p_units, 'deposit', r.method || ' ' || r.reference, p_admin_id);
  update public.deposit_requests
     set status = 'approved', reviewed_at = now(), reviewed_by = p_admin_id
   where id = p_request_id;
end $$;

create or replace function public.admin_reject_deposit(p_request_id bigint, p_note text, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.deposit_requests
     set status = 'rejected', admin_note = p_note, reviewed_at = now(), reviewed_by = p_admin_id
   where id = p_request_id and status = 'pending';
  if not found then raise exception 'request not found or not pending'; end if;
end $$;

create or replace function public.admin_mark_withdrawal_paid(p_request_id bigint, p_note text, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.withdrawal_requests
     set status = 'paid', admin_note = p_note, processed_at = now(), processed_by = p_admin_id
   where id = p_request_id and status = 'pending';
  if not found then raise exception 'request not found or not pending'; end if;
end $$;

create or replace function public.admin_reject_withdrawal(p_request_id bigint, p_note text, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w public.withdrawal_requests;
begin
  select * into w from public.withdrawal_requests where id = p_request_id for update;
  if w.id is null or w.status <> 'pending' then raise exception 'request not found or not pending'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (w.user_id, w.units, 'refund', 'Withdrawal #' || w.id || ' rejected', p_admin_id);
  update public.withdrawal_requests
     set status = 'rejected', admin_note = p_note, processed_at = now(), processed_by = p_admin_id
   where id = p_request_id;
end $$;

revoke execute on function public.admin_approve_deposit(bigint, numeric, uuid)    from public, anon, authenticated;
revoke execute on function public.admin_reject_deposit(bigint, text, uuid)        from public, anon, authenticated;
revoke execute on function public.admin_mark_withdrawal_paid(bigint, text, uuid)  from public, anon, authenticated;
revoke execute on function public.admin_reject_withdrawal(bigint, text, uuid)     from public, anon, authenticated;
grant  execute on function public.admin_approve_deposit(bigint, numeric, uuid)    to service_role;
grant  execute on function public.admin_reject_deposit(bigint, text, uuid)        to service_role;
grant  execute on function public.admin_mark_withdrawal_paid(bigint, text, uuid)  to service_role;
grant  execute on function public.admin_reject_withdrawal(bigint, text, uuid)     to service_role;

-- Manual Telegram wallet: the admin adds or deducts units by hand.
-- Every change is still a row in wallet_ledger ("Manual Telegram Adjustment").

-- Add units (manual deposit): 0 < units <= 50 per transaction.
create or replace function public.admin_add_units(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_units is null or p_units <= 0 then raise exception 'units must be positive'; end if;
  if p_units > 50 then raise exception 'maximum is 50 units (10,000 ETB) per transaction'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, p_units, 'deposit', coalesce(nullif(trim(p_reference), ''), 'Manual Telegram Adjustment'), p_admin_id);
end $$;

-- Deduct units (manual correction / cash-out handled outside the app).
-- Fails with "insufficient balance" rather than going negative.
create or replace function public.admin_deduct_units(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_units is null or p_units <= 0 then raise exception 'units must be positive'; end if;
  if p_units > 50 then raise exception 'maximum is 50 units per transaction'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, -p_units, 'adjustment', coalesce(nullif(trim(p_reference), ''), 'Manual Telegram Adjustment'), p_admin_id);
exception
  when check_violation then raise exception 'insufficient balance';
end $$;

revoke execute on function public.admin_add_units(uuid, numeric, text, uuid)    from public, anon, authenticated;
revoke execute on function public.admin_deduct_units(uuid, numeric, text, uuid) from public, anon, authenticated;
grant  execute on function public.admin_add_units(uuid, numeric, text, uuid)    to service_role;
grant  execute on function public.admin_deduct_units(uuid, numeric, text, uuid) to service_role;
