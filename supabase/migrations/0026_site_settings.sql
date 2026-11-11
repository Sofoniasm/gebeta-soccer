-- 0026: Site settings edited in Admin -> Site (no code change needed):
-- Telegram support/channel links, contact details, which leagues the match
-- sync follows, and whether public player numbers are shown.
-- Only public information goes here (anyone can read it); only the server writes.
-- Safe to re-run.
create table if not exists public.site_settings (
  key         text primary key check (key ~ '^[a-z_]{2,40}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.site_settings enable row level security;
drop policy if exists "anyone reads site settings" on public.site_settings;
create policy "anyone reads site settings" on public.site_settings for select to anon, authenticated using (true);
revoke insert, update, delete, truncate, references, trigger on public.site_settings from anon, authenticated;
