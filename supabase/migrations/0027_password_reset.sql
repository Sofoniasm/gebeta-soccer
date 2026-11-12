-- 0027: "Forgot password?" by Telegram (or SMS).
-- A reset link is a one-time random token: only its SHA-256 fingerprint is
-- stored, it expires after 30 minutes and works once. Only the server reads
-- or writes this table. Safe to re-run.
create table if not exists public.password_resets (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  token_hash  text not null unique,
  channel     text not null check (channel in ('telegram', 'sms', 'admin')),
  requested_ip text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index if not exists password_resets_user_idx on public.password_resets (user_id, created_at desc);
alter table public.password_resets enable row level security;
revoke all on public.password_resets from anon, authenticated;
