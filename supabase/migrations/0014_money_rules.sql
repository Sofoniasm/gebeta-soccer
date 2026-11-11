-- =====================================================================
-- GebetaSoccer — money rules
--   * Deposits: 1,000 – 10,000 ETB per transaction (5 – 50 Units)
--   * Withdrawals: no maximum (winnings of millions are fine), but the
--     player always keeps at least 1 Unit (200 ETB) so the account stays open
--   * Joining a round costs the round's entry fee (default 1 Unit = 200 ETB)
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

create or replace function public.admin_add_units(
  p_user_id uuid, p_units numeric, p_reference text, p_admin_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_units is null or p_units < 5 then raise exception 'minimum deposit is 5 units (1,000 ETB)'; end if;
  if p_units > 50 then raise exception 'maximum is 50 units (10,000 ETB) per transaction'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'player not found'; end if;
  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (p_user_id, p_units, 'deposit', coalesce(nullif(trim(p_reference), ''), 'Telegram deposit'), p_admin_id);
end $$;

create or replace function public.request_withdrawal(p_units numeric, p_phone text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bal numeric;
  v_id  bigint;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select balance_units into v_bal from public.profiles
   where id = v_uid and phone_verified_at is not null for update;
  if v_bal is null then raise exception 'phone not verified'; end if;
  if p_units is null or p_units < 1 then raise exception 'minimum withdrawal is 1 unit'; end if;
  if v_bal - p_units < 1 then raise exception 'must keep 1 unit in the account'; end if;
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

-- Keep the help article in line with the new limits
update public.news_posts
   set body = replace(body, 'send between 200 ETB (1 Unit) and 10,000 ETB (50 Units)',
                            'send between 1,000 ETB (5 Units) and 10,000 ETB (50 Units)')
 where slug = 'how-deposits-and-withdrawals-work';
update public.news_posts
   set body = replace(body, 'choose how many Units to withdraw and confirm your phone number.',
                            'choose how many Units to withdraw (you can take everything except 1 Unit, which keeps your account open) and confirm your phone number.')
 where slug = 'how-deposits-and-withdrawals-work'
   and body not like '%keeps your account open%';
