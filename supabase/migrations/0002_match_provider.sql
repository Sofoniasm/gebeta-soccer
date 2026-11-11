-- Tag every match with the data source it came from, so match ids from
-- different providers (football-data, API-Football, ...) never clash.
alter table public.matches add column provider text not null default 'football-data';
alter table public.matches drop constraint matches_external_id_key;
alter table public.matches add constraint matches_provider_external_id_key unique (provider, external_id);
