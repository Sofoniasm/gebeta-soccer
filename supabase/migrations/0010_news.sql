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
