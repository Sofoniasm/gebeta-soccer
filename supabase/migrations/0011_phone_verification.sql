-- =====================================================================
-- GebetaSoccer — phone verification
-- Players log in with phone + password and must confirm the phone number
-- (via Telegram, or SMS code later) before they can join rounds or
-- withdraw. Run once in Supabase → SQL Editor.
-- =====================================================================

alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.profiles add column if not exists telegram_user_id bigint unique;

-- Accounts created before this change (your test/admin accounts) are
-- treated as verified so nobody gets locked out.
update public.profiles set phone_verified_at = now() where phone_verified_at is null;
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"phone_verified": true}'::jsonb
  from public.profiles p
 where p.id = u.id;

-- One row per verification attempt (Telegram link or SMS code).
create table if not exists public.phone_verifications (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  method            text not null check (method in ('telegram', 'sms')),
  token             text unique,                -- Telegram deep-link token
  code_hash         text,                       -- SMS: sha256 of the code
  telegram_chat_id  bigint,
  attempts          int not null default 0,
  expires_at        timestamptz not null,
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);
create index if not exists phone_verifications_chat_idx on public.phone_verifications (telegram_chat_id, created_at desc);
alter table public.phone_verifications enable row level security;   -- server only, no policies

-- Only verified players can join a round …
create or replace function public.enter_round(p_round_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_fee numeric;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;

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

-- … or withdraw.
create or replace function public.request_withdrawal(p_units numeric, p_phone text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  bigint;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
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
