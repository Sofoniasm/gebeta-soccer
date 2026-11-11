-- GebetaSoccer: run once in Supabase SQL Editor (safe to re-run). Contains 0009 + 0010 + 0011.

-- ===== migrations/0009_superbru_scoring.sql =====
-- =====================================================================
-- GebetaSoccer — Superbru-style scoring
--   * Close = right result AND (1 goal away, OR 2 goals away with the
--     same goal difference — e.g. pick 1-1, ends 2-2)
--   * Slam Points per round: 5-7 correct results +1, 8-9 +2, 10+ +3
--   * Tie-breaks: points → correct results → exact scores → close picks
--     → smallest total goals away
-- Run once in Supabase → SQL Editor.
-- =====================================================================

-- 1. Per-match points (mirror of lib/scoring.ts)
create or replace function public.calc_points(ph int, pa int, ah int, aa int)
returns numeric language sql immutable as $$
  select case
    when ph is null or pa is null or ah is null or aa is null then null
    when ph = ah and pa = aa then 3
    when sign(ph - pa) <> sign(ah - aa) then 0
    when abs(ph - ah) + abs(pa - aa) = 1 then 1.5
    when abs(ph - ah) + abs(pa - aa) = 2 and (ph - pa) = (ah - aa) then 1.5
    else 1
  end::numeric;
$$;

create or replace function public.slam_points(correct bigint)
returns numeric language sql immutable as $$
  select case when correct >= 10 then 3 when correct >= 8 then 2 when correct >= 5 then 1 else 0 end::numeric;
$$;

-- 2. Store each player's Slam Points when a round is settled
alter table public.round_entries add column if not exists slam_points numeric(3,1) not null default 0;

-- 3. Settlement now also records Slam Points
drop function if exists public.settle_round(bigint, jsonb, jsonb, uuid);
create or replace function public.settle_round(
  p_round_id bigint, p_points jsonb, p_payouts jsonb, p_admin_id uuid, p_slams jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round      public.rounds;
  v_prize_fund numeric;
  v_total_paid numeric;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'round not found'; end if;
  if v_round.status not in ('open','locked') then
    raise exception 'round already %', v_round.status;
  end if;

  if exists (select 1 from public.matches
              where round_id = p_round_id
                and status not in ('finished','cancelled','postponed')) then
    raise exception 'not all matches in this round are finished';
  end if;

  select prize_fund_units into v_prize_fund from public.get_round_pool(p_round_id);
  select coalesce(sum((x ->> 'units')::numeric), 0) into v_total_paid
    from jsonb_array_elements(p_payouts) x;
  if v_total_paid > v_prize_fund then
    raise exception 'payouts (%) exceed prize fund (%)', v_total_paid, v_prize_fund;
  end if;

  update public.predictions p
     set points_earned = (x ->> 'points')::numeric
    from jsonb_array_elements(p_points) x
   where p.id = (x ->> 'prediction_id')::bigint;

  update public.round_entries e
     set slam_points = (x ->> 'slam_points')::numeric
    from jsonb_array_elements(p_slams) x
   where e.round_id = p_round_id and e.user_id = (x ->> 'user_id')::uuid;

  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, reference, created_by)
  select (x ->> 'user_id')::uuid, (x ->> 'units')::numeric, 'payout', p_round_id,
         'Round ' || p_round_id || ' winnings', p_admin_id
    from jsonb_array_elements(p_payouts) x
   where (x ->> 'units')::numeric > 0;

  update public.rounds set status = 'settled', settled_at = now() where id = p_round_id;
end $$;
revoke execute on function public.settle_round(bigint, jsonb, jsonb, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.settle_round(bigint, jsonb, jsonb, uuid, jsonb) to service_role;

-- 4. Live round leaderboard with Slam Points and Superbru tie-breaks
drop function if exists public.get_round_leaderboard(bigint);
create or replace function public.get_round_leaderboard(p_round_id bigint)
returns table (rank bigint, username text, points numeric, slam_points numeric, correct_results bigint,
               exact_scores bigint, close_picks bigint, predicted bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with e as (
    select user_id from public.round_entries where round_id = p_round_id
  ),
  picks as (
    select e.user_id, m.status, p.id as pid, p.points_earned,
           p.predicted_home_score ph, p.predicted_away_score pa,
           m.actual_home_score ah, m.actual_away_score aa
      from e
      cross join public.matches m
      left join public.predictions p on p.user_id = e.user_id and p.match_id = m.id
     where m.round_id = p_round_id
  ),
  s as (
    select user_id,
           coalesce(sum(coalesce(points_earned,
                    case when status = 'finished' then public.calc_points(ph, pa, ah, aa) end)), 0) as pts,
           count(*) filter (where status = 'finished' and public.calc_points(ph, pa, ah, aa) > 0) as correct,
           count(*) filter (where status = 'finished' and ph = ah and pa = aa) as ex,
           count(*) filter (where status = 'finished' and public.calc_points(ph, pa, ah, aa) = 1.5) as cl,
           coalesce(sum(case when status = 'finished' then
                      coalesce(abs(ph - ah) + abs(pa - aa), 20) end), 0) as away,
           count(pid) as pred
      from picks group by user_id
  )
  select rank() over (order by s.pts + public.slam_points(s.correct) desc, s.correct desc, s.ex desc, s.cl desc, s.away asc),
         pr.username,
         s.pts + public.slam_points(s.correct),
         public.slam_points(s.correct),
         s.correct, s.ex, s.cl, s.pred,
         s.user_id = auth.uid()
    from s join public.profiles pr on pr.id = s.user_id
   order by 1, pr.username;
$$;
grant execute on function public.get_round_leaderboard(bigint) to anon, authenticated;

-- 5. All-time table now includes Slam Points
drop function if exists public.get_overall_leaderboard(int);
create or replace function public.get_overall_leaderboard(p_limit int default 100)
returns table (rank bigint, username text, rounds_played bigint, points numeric, exact_scores bigint, wins bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with played as (
    select e.user_id, count(*) as rounds, sum(e.slam_points) as slams
      from public.round_entries e join public.rounds r on r.id = e.round_id
     where r.status = 'settled'
     group by e.user_id
  ),
  pts as (
    select p.user_id,
           sum(p.points_earned) as points,
           count(*) filter (where p.points_earned = 3) as ex
      from public.predictions p
      join public.matches m on m.id = p.match_id
      join public.rounds r on r.id = m.round_id and r.status = 'settled'
     group by p.user_id
  ),
  wins as (
    select user_id, count(distinct round_id) as wins
      from public.wallet_ledger where kind = 'payout' group by user_id
  )
  select rank() over (order by coalesce(pts.points, 0) + coalesce(played.slams, 0) desc, coalesce(pts.ex, 0) desc),
         pr.username, played.rounds, coalesce(pts.points, 0) + coalesce(played.slams, 0), coalesce(pts.ex, 0),
         coalesce(wins.wins, 0), played.user_id = auth.uid()
    from played
    join public.profiles pr on pr.id = played.user_id
    left join pts  on pts.user_id  = played.user_id
    left join wins on wins.user_id = played.user_id
   order by 1, pr.username
   limit greatest(p_limit, 1);
$$;
grant execute on function public.get_overall_leaderboard(int) to anon, authenticated;

-- ===== migrations/0010_news.sql =====
-- News / blog posts shown on /news. Public can read published posts;
-- writing is done from the admin side (service role).
create table if not exists public.news_posts (
  id            bigint generated always as identity primary key,
  slug          text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title         text not null,
  excerpt       text not null,
  body          text not null,              -- paragraphs separated by blank lines
  cover_image   text not null default '/stadium.webp',
  tag           text not null default 'News',
  is_published  boolean not null default true,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
alter table public.news_posts enable row level security;
drop policy if exists "anyone reads published news" on public.news_posts;
create policy "anyone reads published news" on public.news_posts
  for select to anon, authenticated using (is_published and published_at <= now());

insert into public.news_posts (slug, title, excerpt, body, cover_image, tag, published_at) values
('welcome-to-gebetasoccer',
 'Welcome to GebetaSoccer',
 'Ethiopia''s weekly football prediction game is here. Predict 10 big matches, climb the table and win the pot.',
 'GebetaSoccer brings the excitement of a weekly prediction league to Ethiopian football fans. Every week we pick 10 big matches from the best leagues in the world, and you predict the score of each one.

The name comes from Gebeta, the board game of seeds and strategy that so many of us grew up playing. Like Gebeta, our game rewards patience, knowledge and a little bit of nerve.

Create your account with just your phone number, top up through our Telegram admin, and join the round. Good luck!',
 '/stadium.webp', 'Announcement', now() - interval '2 days'),
('scoring-explained',
 'Scoring explained: Exact, Close, Result and Slam Points',
 'How points work in GebetaSoccer — and why a close pick can be worth more than you think.',
 'Every match gives you a chance to score. Predict the exact score and you earn 3 points. Get the right result and land within one goal of the real score and you earn 1.5 points for a Close pick. A correct result that isn''t close is worth 1 point.

Draws have a special rule: if you pick 1-1 and the match ends 2-2, you still earn the Close points, because both teams were exactly one goal away.

On top of that, Slam Points reward a strong round: 5–7 correct results earn +1, 8–9 earn +2, and all 10 earn +3. Consistency pays.',
 '/ball.webp', 'Guide', now() - interval '1 day'),
('how-deposits-and-withdrawals-work',
 'How deposits and withdrawals work',
 'Topping up through Telegram and cashing out to your phone — step by step.',
 'To add funds, message our Telegram admin and send between 200 ETB (1 Unit) and 10,000 ETB (50 Units). Quote your GebetaSoccer username so we know whose wallet to credit. Your balance updates as soon as the payment is confirmed.

To cash out, open your Wallet, choose how many Units to withdraw and confirm your phone number. The Units are held immediately so they can''t be spent twice, and the money is sent to you after review.

Every movement of money is recorded in your wallet history, and nothing can be edited or deleted afterwards.',
 '/crowd.webp', 'Guide', now())
on conflict (slug) do nothing;

-- ===== migrations/0011_phone_verification.sql =====
-- =====================================================================
-- GebetaSoccer — phone verification
-- Players log in with phone + password and must confirm the phone number
-- (via Telegram, or SMS code later) before they can join rounds or
-- withdraw. Run once in Supabase → SQL Editor.
-- =====================================================================

alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.profiles add column if not exists telegram_user_id bigint unique;

-- Accounts created before this change (your test/admin accounts) are
-- treated as verified so nobody gets locked out.
update public.profiles set phone_verified_at = now() where phone_verified_at is null;
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"phone_verified": true}'::jsonb
  from public.profiles p
 where p.id = u.id;

-- One row per verification attempt (Telegram link or SMS code).
create table if not exists public.phone_verifications (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  method            text not null check (method in ('telegram', 'sms')),
  token             text unique,                -- Telegram deep-link token
  code_hash         text,                       -- SMS: sha256 of the code
  telegram_chat_id  bigint,
  attempts          int not null default 0,
  expires_at        timestamptz not null,
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);
create index if not exists phone_verifications_chat_idx on public.phone_verifications (telegram_chat_id, created_at desc);
alter table public.phone_verifications enable row level security;   -- server only, no policies

-- Only verified players can join a round …
create or replace function public.enter_round(p_round_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_fee numeric;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;

  select entry_fee_units into v_fee
    from public.rounds where id = p_round_id and status = 'open' for update;
  if v_fee is null then raise exception 'round is not open'; end if;

  insert into public.round_entries (round_id, user_id) values (p_round_id, v_uid);
  insert into public.wallet_ledger (user_id, amount_units, kind, round_id, reference, created_by)
  values (v_uid, -v_fee, 'entry_fee', p_round_id, 'Round entry', v_uid);
exception
  when unique_violation then raise exception 'already entered this round';
  when check_violation  then raise exception 'insufficient balance';
end $$;

-- … or withdraw.
create or replace function public.request_withdrawal(p_units numeric, p_phone text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  bigint;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone_verified_at is not null) then
    raise exception 'phone not verified';
  end if;
  if p_units is null or p_units < 1 then raise exception 'minimum withdrawal is 1 unit'; end if;
  if p_phone is null or p_phone !~ '^\+251[79][0-9]{8}$' then raise exception 'invalid phone'; end if;
  if (select count(*) from public.withdrawal_requests where user_id = v_uid and status = 'pending') >= 3 then
    raise exception 'too many pending withdrawals';
  end if;

  insert into public.withdrawal_requests (user_id, units, payout_phone)
  values (v_uid, p_units, p_phone) returning id into v_id;

  insert into public.wallet_ledger (user_id, amount_units, kind, reference, created_by)
  values (v_uid, -p_units, 'withdrawal', 'Withdrawal request #' || v_id, v_uid);
  return v_id;
exception
  when check_violation then raise exception 'insufficient balance';
end $$;
