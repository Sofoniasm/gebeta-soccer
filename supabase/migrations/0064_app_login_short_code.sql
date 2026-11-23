-- =====================================================================
-- 0064: fallback for the Telegram-app login. Opening the t.me link does not always send the hidden "/start lg_..."
--   command (Telegram desktop for a bot you already started, for example). So the website also shows a 6-digit code:
--   the player sends "/login 123456" to the bot and gets the same 3-number question.
-- =====================================================================
alter table public.telegram_app_logins add column if not exists short_code text check (short_code ~ '^[0-9]{6}$');
create index if not exists telegram_app_logins_short_idx on public.telegram_app_logins (short_code) where status = 'pending';
notify pgrst, 'reload schema';
