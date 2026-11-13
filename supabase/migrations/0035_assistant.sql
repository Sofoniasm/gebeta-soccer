-- =====================================================================
-- 0035: Help assistant (AI) and support requests.
--   assistant_messages: every question and answer (for limits and for the
--     admin to review). support_requests: questions the assistant hands to
--     a person (money problems, disputes, account access).
--   Only the server (service key) reads or writes them. Safe to re-run.
-- =====================================================================
create table if not exists public.assistant_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  chat_id    bigint,
  ip         text,
  channel    text not null check (channel in ('web', 'telegram')),
  question   text not null,
  answer     text,
  escalated  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_user_idx on public.assistant_messages (user_id, created_at desc);
create index if not exists assistant_messages_chat_idx on public.assistant_messages (chat_id, created_at desc);
create index if not exists assistant_messages_ip_idx on public.assistant_messages (ip, created_at desc);
alter table public.assistant_messages enable row level security;
revoke all on public.assistant_messages from anon, authenticated;

create table if not exists public.support_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  chat_id     bigint,
  channel     text not null check (channel in ('web', 'telegram')),
  question    text not null,
  summary     text,
  status      text not null default 'open' check (status in ('open', 'done')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists support_requests_status_idx on public.support_requests (status, created_at desc);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from anon, authenticated;
