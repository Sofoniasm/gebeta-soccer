-- =====================================================================
-- 0037: Daily Football Quiz (free, no money, no prizes).
--   * One quiz per Ethiopian date, 5 multiple-choice questions.
--   * Correct answers never leave the server before a player answers.
--   * Each question has a 20 second timer (checked on the server).
-- Server only: RLS on, no client access. Safe to run more than once.
-- =====================================================================

create table if not exists public.quiz_days (
  id            bigint generated always as identity primary key,
  quiz_date     date not null unique,                 -- Ethiopian (EAT) date it is played
  status        text not null default 'draft' check (status in ('draft', 'published')),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create table if not exists public.quiz_questions (
  id              bigint generated always as identity primary key,
  quiz_id         bigint not null references public.quiz_days (id) on delete cascade,
  position        smallint not null check (position between 1 and 5),
  topic           text not null default '',
  question        text not null,
  question_am     text not null default '',
  options         text[] not null check (array_length(options, 1) = 4),
  options_am      text[] not null default '{}',
  correct         smallint not null check (correct between 0 and 3),
  explanation     text not null default '',
  explanation_am  text not null default '',
  unique (quiz_id, position)
);

create table if not exists public.quiz_answers (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  question_id  bigint not null references public.quiz_questions (id) on delete cascade,
  quiz_id      bigint not null references public.quiz_days (id) on delete cascade,
  shown_at     timestamptz not null default now(),
  answered_at  timestamptz,
  choice       smallint check (choice between 0 and 3),
  is_correct   boolean not null default false,
  unique (user_id, question_id)
);
create index if not exists quiz_answers_month_idx on public.quiz_answers (shown_at) where is_correct;
create index if not exists quiz_answers_user_idx on public.quiz_answers (user_id, quiz_id);

alter table public.quiz_days      enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers   enable row level security;
revoke all on public.quiz_days, public.quiz_questions, public.quiz_answers from anon, authenticated;

-- Monthly (or any period) leaderboard: points = correct answers.
create or replace function public.quiz_leaderboard(p_from timestamptz, p_to timestamptz, p_limit int default 10)
returns table (user_id uuid, username text, points bigint, perfect_days bigint)
language sql stable security definer set search_path = public as $$
  with per_day as (
    select a.user_id, a.quiz_id, count(*) filter (where a.is_correct) as correct
      from public.quiz_answers a
     where a.shown_at >= p_from and a.shown_at < p_to
     group by a.user_id, a.quiz_id
  )
  select d.user_id, p.username, sum(d.correct)::bigint, count(*) filter (where d.correct = 5)::bigint
    from per_day d join public.profiles p on p.id = d.user_id
   where not coalesce(p.is_admin, false)
   group by d.user_id, p.username
  having sum(d.correct) > 0
   order by 3 desc, 4 desc, p.username
   limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.quiz_leaderboard(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.quiz_leaderboard(timestamptz, timestamptz, int) to service_role;
