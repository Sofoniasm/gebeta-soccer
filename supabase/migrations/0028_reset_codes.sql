-- 0028: Password reset by 6-digit code (sent by the Telegram bot).
-- Only a SHA-256 fingerprint of the code is stored. A code expires after
-- 10 minutes, works once, and stops working after 5 wrong tries.
-- We also record whether the Telegram message was delivered, so the admin
-- can see it on the player's page. Safe to re-run.
alter table public.password_resets alter column token_hash drop not null;
alter table public.password_resets add column if not exists code_hash text;
alter table public.password_resets add column if not exists attempts int not null default 0;
alter table public.password_resets add column if not exists delivered text;        -- 'telegram' | 'sms' | 'shown_to_admin' | null
alter table public.password_resets add column if not exists delivery_error text;
-- what happened to the code: changed (password changed), replaced (a newer code was sent), locked (5 wrong tries)
alter table public.password_resets add column if not exists outcome text check (outcome in ('changed', 'replaced', 'locked'));
