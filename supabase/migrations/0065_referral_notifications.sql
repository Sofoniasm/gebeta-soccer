-- =====================================================================
-- 0065: the salesperson is told what the people he invited do, and can see it.
--   * a friend signs up with your link          -> notification "New friend joined with your link"
--   * a friend pays a stake (round, game, ...)  -> notification "<friend> placed a bet"
--   * get_my_referral_activity(): the list on the Invite friends page of what your friends did
--     (stakes, wins, refunds: what and when, never their picks or scores).
--   Only the inviter can see his own friends' activity (security definer, filtered by auth.uid()).
-- =====================================================================

create or replace function public.notify_referrer_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is not null and old.referred_by is null then
    insert into public.notifications (user_id, kind, title, body, link, push)
    values (new.referred_by, 'referral_joined', '👋 New friend joined with your link',
            new.username || ' signed up with your invite link. You earn when your friends win a round or a challenge.', '/sales', true);
  end if;
  return new;
end $$;
revoke execute on function public.notify_referrer_signup() from public, anon, authenticated;
drop trigger if exists profiles_notify_referrer on public.profiles;
create trigger profiles_notify_referrer after update of referred_by on public.profiles
for each row execute function public.notify_referrer_signup();

create or replace function public.notify_referrer_bet() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ref uuid; v_name text;
begin
  if new.kind <> 'entry_fee' then return new; end if;
  select referred_by, username into v_ref, v_name from public.profiles where id = new.user_id;
  if v_ref is null then return new; end if;
  insert into public.notifications (user_id, kind, title, body, link, push)
  values (v_ref, 'referral_bet', '🎯 ' || v_name || ' placed a bet',
          coalesce(nullif(btrim(new.reference), ''), 'A game') || ' · stake ' || public.fmt_units(abs(new.amount_units)) || ' Units. You earn if they win.', '/sales', true);
  return new;
end $$;
revoke execute on function public.notify_referrer_bet() from public, anon, authenticated;
drop trigger if exists wallet_ledger_notify_referrer on public.wallet_ledger;
create trigger wallet_ledger_notify_referrer after insert on public.wallet_ledger
for each row execute function public.notify_referrer_bet();

-- what my friends did: stakes, wins and refunds (what and when, no picks)
create or replace function public.get_my_referral_activity() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'at', x.created_at, 'player', x.username, 'kind', x.kind, 'units', x.amount_units, 'label', x.reference)
           order by x.created_at desc)
      from (select l.created_at, p.username, l.kind, l.amount_units, l.reference
              from public.wallet_ledger l
              join public.profiles p on p.id = l.user_id
             where p.referred_by = v_uid and l.kind in ('entry_fee', 'payout', 'refund')
             order by l.created_at desc
             limit 100) x), '[]'::jsonb);
end $$;
revoke execute on function public.get_my_referral_activity() from public, anon;
grant execute on function public.get_my_referral_activity() to authenticated;

notify pgrst, 'reload schema';
