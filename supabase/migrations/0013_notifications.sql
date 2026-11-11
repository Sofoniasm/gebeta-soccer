-- =====================================================================
-- GebetaSoccer — notifications (in the app + Telegram)
-- Every wallet movement and withdrawal update creates a notification
-- automatically (database triggers), so nothing can be forgotten.
-- The site shows them under the bell; the server also sends the ones
-- marked `push` to the player's Telegram (if they verified with the bot).
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists public.notifications (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  kind              text not null,
  title             text not null,
  body              text,
  link              text,
  push              boolean not null default true,   -- also send to Telegram
  read_at           timestamptz,
  telegram_sent_at  timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_push_idx on public.notifications (created_at) where push and telegram_sent_at is null;

alter table public.notifications enable row level security;
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.notifications from anon, authenticated;

-- Player marks their own notifications as read.
create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null;
$$;
revoke execute on function public.mark_notifications_read() from public, anon;
grant  execute on function public.mark_notifications_read() to authenticated;

-- "50" / "1.5" units, and "10,000" ETB
create or replace function public.fmt_units(n numeric) returns text
language sql immutable as $$
  select rtrim(rtrim(to_char(abs(n), 'FM999,999,999,990.00'), '0'), '.');
$$;
create or replace function public.fmt_etb(n numeric) returns text
language sql immutable as $$
  select to_char(abs(n) * 200, 'FM999,999,999,990');
$$;

-- 1. Every wallet ledger entry → a notification
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
begin
  select balance_units into v_bal from public.profiles where id = new.user_id;
  select coalesce(nullif(trim(name), ''), 'Round ' || id) into v_round from public.rounds where id = new.round_id;

  if new.kind = 'deposit' then
    v_title := '💰 Deposit received';
    v_body  := '+' || v_amt || ' added to your wallet.';
  elsif new.kind = 'payout' then
    v_title := '🏆 You won!';
    v_body  := '+' || v_amt || ' from ' || coalesce(v_round, 'your round') || '. Congratulations!';
    v_link  := '/results';
  elsif new.kind = 'refund' and new.reference like 'Withdrawal #% rejected' then
    v_title := '❌ ' || replace(new.reference, ' rejected', ' not sent');
    v_body  := '+' || v_amt || ' returned to your wallet.';
  elsif new.kind = 'refund' then
    v_title := '↩️ Units returned';
    v_body  := '+' || v_amt || ' back in your wallet' || coalesce(' — ' || new.reference, '') || '.';
  elsif new.kind = 'adjustment' then
    v_title := case when new.amount_units > 0 then '➕ Units added' else '➖ Units deducted' end;
    v_body  := case when new.amount_units > 0 then '+' else '−' end || v_amt ||
               coalesce(' — ' || new.reference, '') || '.';
  elsif new.kind = 'entry_fee' then
    v_title := '⚽ You joined ' || coalesce(v_round, 'the round');
    v_body  := v_amt || ' entry fee paid. Good luck with your predictions!';
    v_link  := '/dashboard';
    v_push  := false;                -- the player did this themselves
  elsif new.kind = 'withdrawal' then
    v_title := '⏳ Withdrawal requested';
    v_body  := v_amt || ' is on hold for you. We''ll send it to your Telebirr soon.';
    v_push  := false;
  else
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, push)
  values (new.user_id, new.kind, v_title,
          v_body || ' Balance: ' || public.fmt_units(coalesce(v_bal, 0)) || ' Units.', v_link, v_push);
  return new;
end $$;

drop trigger if exists wallet_ledger_notify on public.wallet_ledger;
create trigger wallet_ledger_notify
after insert on public.wallet_ledger
for each row execute function public.notify_ledger_entry();
-- (named so it runs after wallet_ledger_apply → the balance shown is the new one)

-- 2. Withdrawal paid → notification; rejected → add the reason to the refund note
create or replace function public.notify_withdrawal_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    insert into public.notifications (user_id, kind, title, body, link)
    values (new.user_id, 'withdrawal_paid', '✅ Withdrawal sent',
            public.fmt_etb(new.units) || ' ETB has been sent to ' || new.payout_phone ||
            coalesce(' — ' || nullif(trim(new.admin_note), ''), '') || '.', '/wallet');
  elsif new.status = 'rejected' and old.status <> 'rejected' and nullif(trim(new.admin_note), '') is not null then
    -- add the admin's reason to the refund notification created a moment ago
    update public.notifications
       set body = 'Reason: ' || trim(new.admin_note) || '. ' || body
     where id = (select id from public.notifications
                  where user_id = new.user_id and kind = 'refund'
                    and title = '❌ Withdrawal #' || new.id || ' not sent'
                  order by id desc limit 1);
  end if;
  return new;
end $$;

drop trigger if exists withdrawal_requests_notify on public.withdrawal_requests;
create trigger withdrawal_requests_notify
after update of status on public.withdrawal_requests
for each row execute function public.notify_withdrawal_status();

-- 3. Phone confirmed → welcome note (the bot already replies, so no push)
create or replace function public.notify_phone_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_verified_at is not null and old.phone_verified_at is null then
    insert into public.notifications (user_id, kind, title, body, link, push)
    values (new.id, 'verified', '📱 Phone confirmed',
            'Welcome to GebetaSoccer! Top up your wallet on Telegram and join this week''s round.', '/wallet', false);
  end if;
  return new;
end $$;

drop trigger if exists profiles_notify_verified on public.profiles;
create trigger profiles_notify_verified
after update of phone_verified_at on public.profiles
for each row execute function public.notify_phone_verified();
