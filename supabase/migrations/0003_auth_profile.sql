-- Store email on the profile, enforce case-insensitive unique usernames,
-- and let the sign-up form check username / phone availability.

alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

-- Backfill email for anyone who signed up before this migration.
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, phone_number, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'player_' || substr(replace(new.id::text, '-', ''), 1, 8)),
    coalesce(new.phone, nullif(new.raw_user_meta_data ->> 'phone_number', '')),
    new.email
  );
  return new;
end $$;

-- Returns only true/false — never reveals who owns a username or phone.
create or replace function public.check_signup_available(p_username text, p_phone text)
returns table (username_taken boolean, phone_taken boolean)
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.profiles where lower(username) = lower(p_username)),
    exists (select 1 from public.profiles where phone_number = p_phone);
$$;
grant execute on function public.check_signup_available(text, text) to anon, authenticated;
