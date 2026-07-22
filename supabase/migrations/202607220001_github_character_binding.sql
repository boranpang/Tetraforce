create schema if not exists private;

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  game_name text not null,
  normalized_game_name text not null,
  courage integer not null check (courage >= 0),
  strength integer not null check (strength >= 0),
  wisdom integer not null check (wisdom >= 0),
  faith integer not null check (faith >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint characters_game_name_length check (char_length(game_name) between 3 and 16),
  constraint characters_game_name_nfkc check (game_name = normalize(game_name, NFKC)),
  constraint characters_normalized_game_name_nfkc check (
    normalized_game_name <> ''
    and normalized_game_name = normalize(normalized_game_name, NFKC)
  ),
  constraint characters_normalized_game_name_key unique (normalized_game_name)
);

create table private.character_identities (
  character_id uuid primary key references public.characters(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id),
  provider text not null default 'github' check (provider = 'github'),
  provider_user_id text not null unique,
  created_at timestamptz not null default statement_timestamp()
);

create table private.character_consents (
  character_id uuid primary key references public.characters(id) on delete cascade,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  privacy_version text not null,
  privacy_accepted_at timestamptz not null
);

create table private.character_binding_rate_limits (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0)
);

alter table public.characters enable row level security;
alter table public.characters force row level security;
alter table private.character_identities enable row level security;
alter table private.character_identities force row level security;
alter table private.character_consents enable row level security;
alter table private.character_consents force row level security;
alter table private.character_binding_rate_limits enable row level security;
alter table private.character_binding_rate_limits force row level security;

revoke all on public.characters from anon, authenticated;
revoke all on private.character_identities from anon, authenticated;
revoke all on private.character_consents from anon, authenticated;
revoke all on private.character_binding_rate_limits from anon, authenticated;

grant usage on schema private to authenticated;
grant select on public.characters to authenticated;
grant select on private.character_identities to authenticated;
grant select on private.character_consents to authenticated;

create policy "Players read their Character"
  on public.characters
  for select
  to authenticated
  using (
    exists (
      select 1
      from private.character_identities identity
      where identity.character_id = characters.id
        and identity.auth_user_id = (select auth.uid())
    )
  );

create policy "Players read their private identity"
  on private.character_identities
  for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

create policy "Players read their Consent"
  on private.character_consents
  for select
  to authenticated
  using (
    exists (
      select 1
      from private.character_identities identity
      where identity.character_id = character_consents.character_id
        and identity.auth_user_id = (select auth.uid())
    )
  );

create or replace function public.consume_character_binding_attempt(
  p_auth_user_id uuid,
  p_provider_user_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempts integer;
begin
  if not exists (
    select 1
    from auth.identities identity
    where identity.user_id = p_auth_user_id
      and identity.provider = 'github'
      and identity.provider_id = p_provider_user_id
  ) then
    raise exception 'Verified GitHub identity is required.' using errcode = '22023';
  end if;

  insert into private.character_binding_rate_limits (
    auth_user_id,
    window_started_at,
    attempt_count
  ) values (
    p_auth_user_id,
    statement_timestamp(),
    1
  )
  on conflict (auth_user_id) do update set
    window_started_at = case
      when private.character_binding_rate_limits.window_started_at
        <= statement_timestamp() - interval '15 minutes'
      then statement_timestamp()
      else private.character_binding_rate_limits.window_started_at
    end,
    attempt_count = case
      when private.character_binding_rate_limits.window_started_at
        <= statement_timestamp() - interval '15 minutes'
      then 1
      else private.character_binding_rate_limits.attempt_count + 1
    end
  returning attempt_count into attempts;

  if attempts > 10 then
    raise exception 'Too many Character binding attempts.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.consume_character_binding_attempt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_character_binding_attempt(uuid, text)
  to service_role;

create or replace function public.get_my_github_character()
returns table (
  id uuid,
  game_name text,
  courage integer,
  strength integer,
  wisdom integer,
  faith integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    character.id,
    character.game_name,
    character.courage,
    character.strength,
    character.wisdom,
    character.faith
  from auth.identities auth_identity
  join private.character_identities identity
    on identity.auth_user_id = auth_identity.user_id
   and identity.provider = auth_identity.provider
   and identity.provider_user_id = auth_identity.provider_id
  join public.characters character on character.id = identity.character_id
  where auth_identity.user_id = auth.uid()
    and auth_identity.provider = 'github'
  limit 1
$$;

revoke all on function public.get_my_github_character() from public, anon;
grant execute on function public.get_my_github_character() to authenticated;

create or replace function public.complete_github_character_binding(
  p_auth_user_id uuid,
  p_provider_user_id text,
  p_game_name text,
  p_normalized_game_name text,
  p_courage integer,
  p_strength integer,
  p_wisdom integer,
  p_faith integer,
  p_terms_version text,
  p_privacy_version text
)
returns table (
  id uuid,
  game_name text,
  courage integer,
  strength integer,
  wisdom integer,
  faith integer,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_identity private.character_identities%rowtype;
  bound_character public.characters%rowtype;
  accepted_at timestamptz := statement_timestamp();
begin
  if not exists (
    select 1
    from auth.identities identity
    where identity.user_id = p_auth_user_id
      and identity.provider = 'github'
      and identity.provider_id = p_provider_user_id
  ) then
    raise exception 'Verified GitHub identity is required.' using errcode = '22023';
  end if;

  select identity.*
    into existing_identity
    from private.character_identities identity
    where identity.auth_user_id = p_auth_user_id
       or identity.provider_user_id = p_provider_user_id
    for update;

  if found then
    if existing_identity.auth_user_id <> p_auth_user_id
      or existing_identity.provider_user_id <> p_provider_user_id then
      raise exception 'GitHub identity mapping conflict.' using errcode = '23505';
    end if;

    select character.*
      into bound_character
      from public.characters character
      where character.id = existing_identity.character_id;

    return query select
      bound_character.id,
      bound_character.game_name,
      bound_character.courage,
      bound_character.strength,
      bound_character.wisdom,
      bound_character.faith,
      false;
    return;
  end if;

  insert into public.characters (
    game_name,
    normalized_game_name,
    courage,
    strength,
    wisdom,
    faith
  ) values (
    p_game_name,
    p_normalized_game_name,
    p_courage,
    p_strength,
    p_wisdom,
    p_faith
  )
  returning * into bound_character;

  insert into private.character_identities (
    character_id,
    auth_user_id,
    provider_user_id
  ) values (
    bound_character.id,
    p_auth_user_id,
    p_provider_user_id
  );

  insert into private.character_consents (
    character_id,
    terms_version,
    terms_accepted_at,
    privacy_version,
    privacy_accepted_at
  ) values (
    bound_character.id,
    p_terms_version,
    accepted_at,
    p_privacy_version,
    accepted_at
  );

  return query select
    bound_character.id,
    bound_character.game_name,
    bound_character.courage,
    bound_character.strength,
    bound_character.wisdom,
    bound_character.faith,
    true;
end;
$$;

revoke all on function public.complete_github_character_binding(
  uuid, text, text, text, integer, integer, integer, integer, text, text
) from public, anon, authenticated;

grant execute on function public.complete_github_character_binding(
  uuid, text, text, text, integer, integer, integer, integer, text, text
) to service_role;
