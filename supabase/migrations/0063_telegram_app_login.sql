-- =====================================================================
-- 0063: "Log in with the Telegram app" from a phone browser.
--   The login page asks for a one-time token; the player taps "Open Telegram app", the bot (opened by a
--   t.me/<bot>?start=lg_<token> link) asks them to tap the 2-digit number shown on the website, and the page
--   signs them in by itself. The number match stops someone else from approving a login you did not start.
--   Only the server touches this table; the token is stored hashed and lives 5 minutes.
-- =====================================================================
create table if not exists public.telegram_app_logins (
  id               bigint generated always as identity primary key,
  token_hash       text not null unique,
  code             text not null check (code ~ '^[0-9]{2}$'),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'used')),
  telegram_user_id bigint,
  user_id          uuid references public.profiles (id) on delete cascade,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '5 minutes')
);
create index if not exists telegram_app_logins_created_idx on public.telegram_app_logins (created_at);
alter table public.telegram_app_logins enable row level security;
revoke all on public.telegram_app_logins from anon, authenticated;

notify pgrst, 'reload schema';
