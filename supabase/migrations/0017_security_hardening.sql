-- =====================================================================
-- GebetaSoccer — security hardening (from the security audit)
--  1. Private leagues are visible only to their captain and members;
--     anyone else needs the exact code (get_league_by_code).
--  2. Logged-out visitors can't call league / career / pick functions.
--  3. "Is this phone registered?" can only be asked by the server.
--  4. Remove write / truncate rights the website never uses (RLS already
--     blocks them; this is a second lock on the door).
--  5. Unused deposit_requests: players can no longer insert rows.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- 1. League privacy -----------------------------------------------------
create or replace function public.league_visible(p_league_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leagues where id = p_league_id and captain_id = auth.uid())
      or exists (select 1 from public.league_members where league_id = p_league_id and user_id = auth.uid());
$$;

drop policy if exists "players read leagues" on public.leagues;
drop policy if exists "members read their leagues" on public.leagues;
create policy "members read their leagues" on public.leagues for select to authenticated
  using (public.league_visible(id));

-- Public card for an invite code (what a friend sees before joining)
create or replace function public.get_league_by_code(p_code text)
returns table (id bigint, code text, name text, captain_id uuid, round_id bigint, entry_fee_units numeric,
               house_cut numeric, status text, round_name text, round_status text)
language sql stable security definer set search_path = public as $$
  select l.id, l.code, l.name, l.captain_id, l.round_id, l.entry_fee_units, l.house_cut, l.status, r.name, r.status
    from public.leagues l join public.rounds r on r.id = l.round_id
   where l.code = upper(trim(p_code)) and auth.uid() is not null;
$$;

-- 2. Function permissions ----------------------------------------------
do $$
declare f text;
begin
  -- signed-in players only
  foreach f in array array[
    'get_league_by_code(text)', 'get_league_members(bigint)', 'get_league_pool(bigint)',
    'is_league_member(bigint)', 'league_visible(bigint)', 'can_predict_round(bigint)',
    'get_my_career()', 'get_match_picks(bigint)', 'mark_notifications_read()',
    'create_league(text, bigint, numeric, boolean)', 'join_league(text, boolean)',
    'enter_round(bigint)', 'request_withdrawal(numeric, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;

  -- signed-in players + server
  execute 'revoke execute on function public.get_league_leaderboard(bigint) from public, anon';
  execute 'grant execute on function public.get_league_leaderboard(bigint) to authenticated, service_role';

  -- server only
  foreach f in array array['check_signup_available(text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;

  -- trigger functions are never called directly
  foreach f in array array[
    'apply_ledger_entry()', 'handle_new_user()', 'notify_ledger_entry()', 'notify_phone_verified()',
    'notify_withdrawal_status()', 'sync_admin_flag()', 'block_ledger_changes()'
  ] loop
    begin
      execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- 3. Table rights the website never uses --------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
    if t = 'predictions' then
      execute format('revoke delete on public.%I from anon, authenticated', t);
    elsif t = 'profiles' then
      execute format('revoke insert, delete on public.%I from anon, authenticated', t);
    else
      execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
-- (predictions keep their column-level insert/update of the score only;
--  profiles keep update of username only — both still also checked by RLS)

-- 4. Unused deposit requests ----------------------------------------------
drop policy if exists "create own deposit request" on public.deposit_requests;

-- 5. Keep successful logins for 90 days (admin "last seen" / activity);
--    wrong-password tries are still cleared after 2 days.
create or replace function public.record_login_attempt(p_key text, p_ip text, p_success boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.login_attempts (login_key, ip, success) values (p_key, p_ip, p_success);
  if p_success then
    delete from public.login_attempts where login_key = p_key and not success;
  end if;
  delete from public.login_attempts
   where (not success and created_at < now() - interval '2 days')
      or (success and created_at < now() - interval '90 days');
end $$;
revoke execute on function public.record_login_attempt(text, text, boolean) from public, anon, authenticated;
grant  execute on function public.record_login_attempt(text, text, boolean) to service_role;
