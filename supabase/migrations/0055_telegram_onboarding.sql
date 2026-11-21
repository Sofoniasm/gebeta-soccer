-- 0055: sign-up inside the Telegram bot chat.
-- A new Telegram user is asked for their date of birth (18+ only) and then to share their phone number.
-- This table only remembers where they are in those two steps (and where to send them to play afterwards).
-- Server only: nothing here is readable or writable from a browser. Rows are deleted when the account is made.
create table if not exists public.telegram_onboarding (
  chat_id    bigint primary key,
  step       text not null check (step in ('dob', 'phone')),
  dob        date,
  next_path  text check (next_path is null or (next_path like '/%' and next_path not like '//%' and char_length(next_path) <= 200)),
  updated_at timestamptz not null default now()
);
alter table public.telegram_onboarding enable row level security;
revoke all on public.telegram_onboarding from anon, authenticated;

-- make the new table visible to the API right away
notify pgrst, 'reload schema';
