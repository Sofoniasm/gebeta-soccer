-- 0054: end every login session of one player (server only).
-- Used when the real owner of a phone number proves it with Telegram and takes over an account that was
-- made with that number on the website but never confirmed: the old password is wiped and old sessions end.
create or replace function public.revoke_user_sessions(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
end $$;
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- make the new function visible to the API right away
notify pgrst, 'reload schema';
