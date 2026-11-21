-- =====================================================================
-- 0062: sync on demand.
--   GitHub's schedule only ran the match sync about 3 times a day. Now the app also kicks the sync when players
--   are using it: any logged-in page asks /api/sync-kick, which runs the sync if the last one was more than
--   25 minutes ago. This table + function make sure only one request wins that claim, so the sync never runs
--   twice at once, whoever asks. The GitHub schedule and the daily Vercel cron stay as a backup for quiet hours.
-- =====================================================================

create table if not exists public.app_sync_state (
  id          int primary key default 1 check (id = 1),
  last_run_at timestamptz not null default 'epoch'
);
insert into public.app_sync_state (id) values (1) on conflict (id) do nothing;
alter table public.app_sync_state enable row level security;
revoke all on public.app_sync_state from anon, authenticated;

-- true = you won the claim: run the sync now. false = a sync ran (or started) less than p_gap_seconds ago.
create or replace function public.sync_try_claim(p_gap_seconds int default 1500)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_rows int;
begin
  update public.app_sync_state set last_run_at = now()
   where id = 1 and last_run_at < now() - make_interval(secs => greatest(p_gap_seconds, 60));
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;
revoke all on function public.sync_try_claim(int) from public, anon, authenticated;
grant execute on function public.sync_try_claim(int) to service_role;

-- the scheduled/cron runs count too, so the page kick does not repeat them
create or replace function public.sync_mark_ran()
returns void
language sql volatile security definer set search_path = public as $$
  update public.app_sync_state set last_run_at = now() where id = 1;
$$;
revoke all on function public.sync_mark_ran() from public, anon, authenticated;
grant execute on function public.sync_mark_ran() to service_role;

notify pgrst, 'reload schema';
