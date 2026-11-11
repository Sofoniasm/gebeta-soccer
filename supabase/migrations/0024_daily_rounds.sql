-- 0024: Daily rounds. Several rounds can be open at once (e.g. "Morning
-- Round" and "Evening Round"); each locks at its own first kickoff.
-- auto_settle: the 15-minute match sync settles the round by itself as soon
-- as all its matches are over (same rules as the admin's Settle button).
-- Safe to re-run.
alter table public.rounds add column if not exists auto_settle boolean not null default false;
