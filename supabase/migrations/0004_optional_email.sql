-- Email is optional. Players who sign up without one get a hidden
-- placeholder login address ending in ".invalid" (a domain that can never
-- receive mail, so no one can ever take over the account through it).
-- Keep that placeholder OUT of profiles.email.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, phone_number, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'player_' || substr(replace(new.id::text, '-', ''), 1, 8)),
    coalesce(new.phone, nullif(new.raw_user_meta_data ->> 'phone_number', '')),
    case when new.email like '%.invalid' then null else new.email end
  );
  return new;
end $$;

update public.profiles set email = null where email like '%.invalid';
