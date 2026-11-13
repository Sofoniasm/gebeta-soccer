-- Amharic versions of news articles, shown on the /am pages. Empty = show English.
-- Safe to run more than once.
alter table public.news_posts add column if not exists title_am   text not null default '';
alter table public.news_posts add column if not exists excerpt_am text not null default '';
alter table public.news_posts add column if not exists body_am    text not null default '';
