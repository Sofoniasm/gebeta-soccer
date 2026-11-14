-- =====================================================================
-- 0043: Crypto deposits through NOWPayments (instead of AuraPay for now).
--   * crypto_deposits.provider : 'nowpayments' or 'aurapay'.
--   * chain 'ANY' : the player picks the coin (USDT TRC-20, TON, BTC, ...) on
--     NOWPayments' payment page; we only fix the price in USD.
--   * pay_currency : the coin the player actually used (from NOWPayments).
--   * crypto_credit_deposit : same rules as 0042 (credits once, limits, 18+),
--     the history line now reads "Crypto deposit · 7.5 USD · usdttrc20 · <id>".
-- Needs 0042 first. Safe to re-run.
-- =====================================================================

alter table public.crypto_deposits add column if not exists provider text not null default 'aurapay';
alter table public.crypto_deposits add column if not exists pay_currency text;
alter table public.crypto_deposits drop constraint if exists crypto_deposits_chain_check;
alter table public.crypto_deposits add constraint crypto_deposits_chain_check check (chain in ('TRON', 'TON', 'ANY'));
alter table public.crypto_deposits drop constraint if exists crypto_deposits_provider_check;
alter table public.crypto_deposits add constraint crypto_deposits_provider_check check (provider in ('aurapay', 'nowpayments'));

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
           note = format('paid %s, invoice was %s USD', coalesce(p_paid::text, '?'), d.usd)
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
    values (
      d.user_id, d.units, 'deposit',
      format('Crypto deposit · %s USD · %s · %s', d.usd, coalesce(d.pay_currency, case when d.chain = 'ANY' then 'crypto' else 'USDT ' || d.chain end), d.reference),
      p_admin_id
    );
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
