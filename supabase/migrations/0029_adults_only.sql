-- =====================================================================
-- 0029: 18+ everywhere.
-- Deposits now need a saved date of birth showing 18+, like bets already do
-- (0025). The same trigger on the wallet ledger checks both, so no way of
-- adding money or paying for a bet skips the age check.
-- Withdrawals, refunds, payouts and admin adjustments are not blocked.
-- Safe to re-run.
-- =====================================================================
create or replace function public.guard_bet_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if new.kind not in ('entry_fee', 'deposit') then return new; end if;
  select * into p from public.profiles where id = new.user_id;
  if p.date_of_birth is null then
    raise exception 'the player must add their date of birth (18+) first';
  end if;
  if not public.is_adult(p.date_of_birth) then
    raise exception 'you must be 18 or older to play';
  end if;
  if new.kind = 'entry_fee' and p.excluded_until is not null and p.excluded_until > now() then
    raise exception 'betting paused: you are taking a break until %', to_char(p.excluded_until at time zone 'Africa/Addis_Ababa', 'DD Mon YYYY HH24:MI');
  end if;
  return new;
end $$;
revoke execute on function public.guard_bet_payment() from public, anon, authenticated;
