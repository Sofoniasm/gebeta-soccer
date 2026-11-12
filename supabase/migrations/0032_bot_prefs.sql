-- =====================================================================
-- 0032: Telegram bot language (/english, /amharic). One row per Telegram
-- chat, so it also works before the player links their account.
-- Only the server (service key) reads or writes it. Safe to re-run.
-- =====================================================================
create table if not exists public.telegram_prefs (
  chat_id    bigint primary key,
  lang       text not null default 'en' check (lang in ('en', 'am')),
  updated_at timestamptz not null default now()
);
alter table public.telegram_prefs enable row level security;
revoke all on public.telegram_prefs from anon, authenticated;
