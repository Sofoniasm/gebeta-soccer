-- =====================================================================
-- 0041: Telegram channel posts for automatic rounds.
--   rounds.announced_at = when the bot posted this round to the public
--   channel (@GebetaSoccerOfficial). Empty = not posted yet. The server
--   sets it BEFORE posting, so a round is never posted twice.
--   When the column is first added, rounds that already exist are marked
--   as posted, so old rounds are not suddenly posted all at once.
--   Only the server (secret key) writes it; players can read rounds as before
--   (policy "anyone reads rounds"), so no new grants are needed.
-- Safe to re-run.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rounds' and column_name = 'announced_at'
  ) then
    alter table public.rounds add column announced_at timestamptz;
    update public.rounds set announced_at = now();
  end if;
end $$;

-- Fast lookup of open automatic rounds that still need a post.
create index if not exists rounds_not_announced_idx
  on public.rounds (id)
  where announced_at is null and auto_slot is not null;
