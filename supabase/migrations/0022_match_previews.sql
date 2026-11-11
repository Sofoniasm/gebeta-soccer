-- =====================================================================
-- 0022: Match prediction pages (SEO / AI answers)
--   * match_previews: the admin's score tip + short answer + analysis for a
--     match, shown on /predictions/<home>-vs-<away>-<id>
--   * get_match_pick_split: how GebetaSoccer players predicted a match
--     (percentages only, never names), available once the match kicks off
-- Safe to re-run.
-- =====================================================================

create table if not exists public.match_previews (
  match_id      bigint primary key references public.matches (id) on delete cascade,
  pick_home     smallint not null check (pick_home between 0 and 20),
  pick_away     smallint not null check (pick_away between 0 and 20),
  confidence    text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  verdict       text not null check (char_length(verdict) between 20 and 400),
  body          text not null default '',
  is_published  boolean not null default true,
  author_id     uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.match_previews enable row level security;
drop policy if exists "anyone reads published previews" on public.match_previews;
create policy "anyone reads published previews" on public.match_previews
  for select to anon, authenticated using (is_published);
-- Only the server (after checking the caller is an admin) writes previews.
revoke insert, update, delete, truncate, references, trigger on public.match_previews from anon, authenticated;

-- Pick split from all slips in the main pool. Before kickoff it only says how
-- many picks there are; percentages appear once the match (or its round) has started.
create or replace function public.get_match_pick_split(p_match_id bigint)
returns table (picks bigint, home_win numeric, draw numeric, away_win numeric, top_score text, top_score_pct numeric)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.matches where id = p_match_id),
  open_now as (
    select (coalesce(public.round_lock_at(m.round_id), m.kickoff_at) <= now() or m.status <> 'scheduled') as started from m
  ),
  p as (select sp.home, sp.away from public.slip_picks sp where sp.match_id = p_match_id),
  n as (select count(*)::numeric c from p),
  top as (
    select home || '-' || away s, count(*) k from p group by home, away order by count(*) desc, home, away limit 1
  )
  select (select c from n)::bigint,
         case when o.started and n.c > 0 then round(100 * (select count(*) from p where home > away) / n.c, 0) end,
         case when o.started and n.c > 0 then round(100 * (select count(*) from p where home = away) / n.c, 0) end,
         case when o.started and n.c > 0 then round(100 * (select count(*) from p where home < away) / n.c, 0) end,
         case when o.started then (select s from top) end,
         case when o.started and n.c > 0 then round(100 * (select k from top) / n.c, 0) end
    from open_now o, n;
$$;
revoke execute on function public.get_match_pick_split(bigint) from public;
grant  execute on function public.get_match_pick_split(bigint) to anon, authenticated;
