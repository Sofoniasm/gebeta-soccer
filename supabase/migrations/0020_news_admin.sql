-- 0020: News admin. The admin writes, edits, schedules and deletes articles
-- from Admin -> News. Players and visitors still only ever read published
-- articles whose publish time has passed (policy from 0010).

alter table public.news_posts
  add column if not exists author_id  uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists news_posts_published_idx on public.news_posts (published_at desc);

-- The website never writes news with a player's login: only the server
-- (secret key) after checking the caller is an admin.
revoke insert, update, delete, truncate on public.news_posts from anon, authenticated;

-- Public image bucket for article cover photos (uploaded by the server only).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('news', 'news', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
