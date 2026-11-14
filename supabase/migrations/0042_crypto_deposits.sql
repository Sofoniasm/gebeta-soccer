-- =====================================================================
-- 0042: Crypto deposits (AuraPay Global, USDT on TRON or TON).
--   A player picks how many Units, gets an AuraPay invoice in USDT, pays,
--   and AuraPay's signed webhook credits the Units automatically.
--   Manual Telegram/Telebirr deposits do not change.
--   * crypto_deposits     : one row per invoice. Players can only read their own.
--   * crypto_credit_deposit: the ONLY way a crypto deposit adds Units. Server
--     only (secret key). Credits once: a second webhook does nothing.
--     If the Units can't be added (weekly limit, no date of birth, paid too
--     little) the row becomes 'paid_not_credited' with the reason, so the
--     admin can sort it out (Admin → Deposits). The player's money is never lost.
-- Safe to re-run.
-- =====================================================================

create table if not exists public.crypto_deposits (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete restrict,
  units        numeric(12,2) not null check (units >= 5 and units <= 500),
  usd          numeric(12,2) not null check (usd > 0),
  chain        text not null check (chain in ('TRON', 'TON')),
  reference    text unique,                 -- AuraPay PR-XXXXXX
  checkout_url text,
  status       text not null default 'pending'
               check (status in ('pending', 'credited', 'paid_not_credited', 'expired', 'failed')),
  paid_amount  numeric(14,6),
  tx_hash      text,
  event_id     text,
  note         text,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz,
  credited_at  timestamptz,
  credited_by  uuid references auth.users (id)
);
create index if not exists crypto_deposits_user_idx on public.crypto_deposits (user_id, created_at desc);
create index if not exists crypto_deposits_status_idx on public.crypto_deposits (status, created_at desc);

alter table public.crypto_deposits enable row level security;
drop policy if exists "players read own crypto deposits" on public.crypto_deposits;
create policy "players read own crypto deposits" on public.crypto_deposits
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.crypto_deposits from anon, authenticated;

-- Credit a paid invoice. p_admin_id = an admin crediting by hand (skips the amount check,
-- the admin checked the payment in AuraPay). Returns: credited | already credited |
-- not found | not credited: <reason>.
create or replace function public.crypto_credit_deposit(
  p_reference text, p_paid numeric, p_tx_hash text, p_event_id text, p_admin_id uuid default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  d       public.crypto_deposits;
  v_limit numeric;
  v_used  numeric;
begin
  select * into d from public.crypto_deposits where reference = p_reference for update;
  if d.id is null then return 'not found'; end if;
  if d.status = 'credited' then return 'already credited'; end if;

  update public.crypto_deposits
     set paid_amount = coalesce(p_paid, paid_amount),
         tx_hash     = coalesce(nullif(p_tx_hash, ''), tx_hash),
         event_id    = coalesce(nullif(p_event_id, ''), event_id),
         paid_at     = coalesce(paid_at, now())
   where id = d.id;

  if p_admin_id is null and (p_paid is null or p_paid < d.usd - 0.01) then
    update public.crypto_deposits set status = 'paid_not_credited',
           note = format('paid %s USDT, invoice was %s USDT', coalesce(p_paid::text, '?'), d.usd)
     where id = d.id;
    return 'not credited: paid less than the invoice';
  end if;

  begin
    perform 1 from public.profiles where id = d.user_id for update;
    v_limit := public.effective_deposit_limit(d.user_id);
    if v_limit is not null then
      v_used := public.deposits_last_7_days(d.user_id);
      if v_used + d.units > v_limit then
        raise exception 'over the player''s weekly deposit limit: % of % units used in the last 7 days', v_used, v_limit;
      end if;
    end if;
    -- The ledger trigger also checks date of birth / 18+.
    insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
    values (d.user_id, d.units, 'deposit', format('Crypto deposit · %s USDT (%s) · %s', d.usd, d.chain, d.reference), p_admin_id);
  exception when others then
    update public.crypto_deposits set status = 'paid_not_credited', note = sqlerrm where id = d.id;
    return 'not credited: ' || sqlerrm;
  end;

  update public.crypto_deposits
     set status = 'credited', credited_at = now(), credited_by = p_admin_id, note = null
   where id = d.id;
  return 'credited';
end $$;
revoke execute on function public.crypto_credit_deposit(text, numeric, text, text, uuid) from public, anon, authenticated;
grant  execute on function public.crypto_credit_deposit(text, numeric, text, text, uuid) to service_role;
