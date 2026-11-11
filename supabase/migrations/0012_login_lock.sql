-- =====================================================================
-- GebetaSoccer — login lock (brute-force protection)
--   * 5 wrong passwords on one phone / username → that login is locked
--     for 15 minutes (counted from the last wrong try).
--   * Too many wrong passwords from one network (IP) → throttled for
--     15 minutes. The limit is generous because many Ethiopian mobile
--     users share the same carrier IP address.
-- Only the server (secret key) can use these. Run once in Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.login_attempts (
  id          bigint generated always as identity primary key,
  login_key   text not null,          -- normalised phone, or lower-case username/email
  ip          text not null,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists login_attempts_key_idx on public.login_attempts (login_key, created_at desc);
create index if not exists login_attempts_ip_idx  on public.login_attempts (ip, created_at desc);
alter table public.login_attempts enable row level security;   -- no policies: server only

-- Is this login (or network) currently locked? Returns null when allowed.
create or replace function public.login_lock_status(p_key text, p_ip text)
returns table (scope text, retry_minutes int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_window    interval := interval '15 minutes';
  v_key_max   int := 5;
  v_ip_max    int := 30;
  v_n         int;
  v_last      timestamptz;
begin
  select count(*), max(created_at) into v_n, v_last
    from public.login_attempts
   where login_key = p_key and not success and created_at > now() - v_window;
  if v_n >= v_key_max then
    return query select 'account'::text,
      greatest(1, ceil(extract(epoch from (v_last + v_window - now())) / 60)::int);
    return;
  end if;

  select count(*), max(created_at) into v_n, v_last
    from public.login_attempts
   where ip = p_ip and not success and created_at > now() - v_window;
  if v_n >= v_ip_max then
    return query select 'network'::text,
      greatest(1, ceil(extract(epoch from (v_last + v_window - now())) / 60)::int);
  end if;
end $$;

-- Record a login try. A successful login clears that login's wrong tries.
create or replace function public.record_login_attempt(p_key text, p_ip text, p_success boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.login_attempts (login_key, ip, success) values (p_key, p_ip, p_success);
  if p_success then
    delete from public.login_attempts where login_key = p_key and not success;
  end if;
  -- keep the table small
  delete from public.login_attempts where created_at < now() - interval '2 days';
end $$;

-- Admin helper: unlock a player straight away (e.g. after they message you).
create or replace function public.clear_login_lock(p_key text)
returns void language sql security definer set search_path = public as $$
  delete from public.login_attempts where login_key = p_key and not success;
$$;

revoke execute on function public.login_lock_status(text, text)            from public, anon, authenticated;
revoke execute on function public.record_login_attempt(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.clear_login_lock(text)                     from public, anon, authenticated;
grant  execute on function public.login_lock_status(text, text)            to service_role;
grant  execute on function public.record_login_attempt(text, text, boolean) to service_role;
grant  execute on function public.clear_login_lock(text)                     to service_role;
