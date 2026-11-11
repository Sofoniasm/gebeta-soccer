-- =====================================================================
-- 0023: Date of birth (18+), profile pictures, Amharic match previews
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------- date of birth
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists avatar_url text;

create or replace function public.is_adult(p_dob date) returns boolean
language sql stable as $$
  select p_dob is not null and p_dob <= (now() at time zone 'Africa/Addis_Ababa')::date - interval '18 years'
                           and p_dob >= date '1900-01-01';
$$;

-- New accounts: the server sends date_of_birth with the sign-up; the database
-- refuses anyone under 18 even if the website check were skipped.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dob date;
begin
  begin
    v_dob := nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date;
  exception when others then
    raise exception 'invalid date of birth';
  end;
  if v_dob is not null and not public.is_adult(v_dob) then
    raise exception 'you must be 18 or older';
  end if;
  insert into public.profiles (id, username, phone_number, email, is_admin, date_of_birth)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'player_' || substr(replace(new.id::text, '-', ''), 1, 8)),
    coalesce(new.phone, nullif(new.raw_user_meta_data ->> 'phone_number', '')),
    case when new.email like '%.invalid' then null else new.email end,
    exists (select 1 from public.admin_emails a where a.email = lower(new.email)),
    v_dob
  );
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Players who signed up before this: add it once from the Profile page.
create or replace function public.set_my_date_of_birth(p_dob date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_adult(p_dob) then raise exception 'you must be 18 or older'; end if;
  update public.profiles set date_of_birth = p_dob where id = auth.uid() and date_of_birth is null;
  if not found then raise exception 'date of birth already set'; end if;
end $$;
revoke execute on function public.set_my_date_of_birth(date) from public, anon;
grant  execute on function public.set_my_date_of_birth(date) to authenticated;

-- ---------------------------------------------------------- profile pictures
-- Public bucket for small square photos (the phone shrinks them before upload);
-- only the server writes to it, after checking who is signed in.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Logged-in players can see each other's pictures (leaderboards, challenges).
create or replace function public.get_avatars(p_usernames text[])
returns table (username text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.username, p.avatar_url from public.profiles p
   where p.username = any (p_usernames) and p.avatar_url is not null
   limit 500;
$$;
revoke execute on function public.get_avatars(text[]) from public, anon;
grant  execute on function public.get_avatars(text[]) to authenticated;

-- ---------------------------------------------------------- Amharic previews
alter table public.match_previews add column if not exists verdict_am text check (verdict_am is null or char_length(verdict_am) between 10 and 400);
alter table public.match_previews add column if not exists body_am text;
