-- 0038: contact details captured automatically when the help assistant hands
-- a question to the team (Telegram id/@username, phone, username), so players
-- are never asked for them. Server only, like the rest of support_requests.
alter table public.support_requests add column if not exists contact jsonb not null default '{}'::jsonb;
