alter table public.characters
  add column total_tokens_offered bigint not null default 0
    check (total_tokens_offered between 0 and 9007199254740991),
  add column claude_code_tokens_offered bigint not null default 0
    check (claude_code_tokens_offered between 0 and 9007199254740991),
  add column codex_tokens_offered bigint not null default 0
    check (codex_tokens_offered between 0 and 9007199254740991),
  add column offering_count integer not null default 0
    check (offering_count >= 0),
  add column rank_eligible boolean not null default false,
  add column cooldown_ends_at timestamptz,
  add column pending_points integer not null default 0
    check (pending_points >= 0),
  add column total_tokens_attained_at timestamptz,
  add column courage_attained_at timestamptz,
  add column strength_attained_at timestamptz,
  add column wisdom_attained_at timestamptz,
  add column faith_attained_at timestamptz,
  add constraint characters_offered_tokens_by_agent check (
    total_tokens_offered =
      claude_code_tokens_offered + codex_tokens_offered
  ),
  add constraint characters_rank_eligibility check (
    rank_eligible = (offering_count > 0)
  );

update public.characters
set courage_attained_at = created_at,
    strength_attained_at = created_at,
    wisdom_attained_at = created_at,
    faith_attained_at = created_at;

alter table public.characters
  alter column courage_attained_at set default statement_timestamp(),
  alter column courage_attained_at set not null,
  alter column strength_attained_at set default statement_timestamp(),
  alter column strength_attained_at set not null,
  alter column wisdom_attained_at set default statement_timestamp(),
  alter column wisdom_attained_at set not null,
  alter column faith_attained_at set default statement_timestamp(),
  alter column faith_attained_at set not null;

create table private.offerings (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  idempotency_key uuid not null,
  result_type text not null default 'blessing'
    check (result_type = 'blessing'),
  offered_tokens bigint not null
    check (offered_tokens between 1 and 9007199254740991),
  claude_code_tokens bigint not null
    check (claude_code_tokens between 0 and 9007199254740991),
  codex_tokens bigint not null
    check (codex_tokens between 0 and 9007199254740991),
  awarded_points integer not null check (awarded_points between 1 and 3),
  allocated_courage integer check (allocated_courage >= 0),
  allocated_strength integer check (allocated_strength >= 0),
  allocated_wisdom integer check (allocated_wisdom >= 0),
  allocated_faith integer check (allocated_faith >= 0),
  created_at timestamptz not null default statement_timestamp(),
  cooldown_ends_at timestamptz not null,
  acknowledged_at timestamptz,
  constraint offerings_character_idempotency_key
    unique (character_id, idempotency_key),
  constraint offerings_tokens_by_agent check (
    offered_tokens = claude_code_tokens + codex_tokens
  ),
  constraint offerings_cooldown_order check (
    cooldown_ends_at = created_at + interval '12 hours'
  ),
  constraint offerings_allocation_complete check (
    (
      acknowledged_at is null
      and allocated_courage is null
      and allocated_strength is null
      and allocated_wisdom is null
      and allocated_faith is null
    )
    or
    (
      acknowledged_at is not null
      and allocated_courage is not null
      and allocated_strength is not null
      and allocated_wisdom is not null
      and allocated_faith is not null
      and awarded_points =
        allocated_courage + allocated_strength +
        allocated_wisdom + allocated_faith
    )
  )
);

create index offerings_character_id_idx
  on private.offerings(character_id);

create unique index offerings_one_pending_result
  on private.offerings(character_id)
  where acknowledged_at is null;

alter table private.offerings enable row level security;
alter table private.offerings force row level security;
revoke all on private.offerings from anon, authenticated;

alter function public.sync_collector_usage_summaries(
  text, text, text, jsonb
) set schema private;

revoke all on function private.sync_collector_usage_summaries(
  text, text, text, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.sync_collector_usage_summaries(
  p_credential_selector text,
  p_credential_digest text,
  p_collector_version text,
  p_summaries jsonb
)
returns table (
  accepted_summaries integer,
  eligible_tokens text,
  last_successful_sync_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_character_id uuid;
begin
  select device.character_id
    into target_character_id
    from private.collector_devices device
    where device.credential_selector = p_credential_selector
      and private.constant_time_text_equal(
        device.credential_digest,
        p_credential_digest
      );

  if target_character_id is not null then
    perform 1
      from public.characters character
      where character.id = target_character_id
      for update;
  end if;

  return query
    select *
    from private.sync_collector_usage_summaries(
      p_credential_selector,
      p_credential_digest,
      p_collector_version,
      p_summaries
    );
end;
$$;

revoke all on function public.sync_collector_usage_summaries(
  text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.sync_collector_usage_summaries(
  text, text, text, jsonb
) to service_role;

create or replace function private.lock_github_character(
  p_auth_user_id uuid,
  p_provider_user_id text
)
returns public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_character public.characters%rowtype;
begin
  select character.*
    into target_character
    from auth.identities auth_identity
    join private.character_identities identity
      on identity.auth_user_id = auth_identity.user_id
     and identity.provider = auth_identity.provider
     and identity.provider_user_id = auth_identity.provider_id
    join public.characters character on character.id = identity.character_id
    where auth_identity.user_id = p_auth_user_id
      and auth_identity.provider = 'github'
      and auth_identity.provider_id = p_provider_user_id
    for update of character;

  if not found then
    raise exception 'PERSISTENT_CHARACTER_REQUIRED' using errcode = '42501';
  end if;

  return target_character;
end;
$$;

revoke all on function private.lock_github_character(
  uuid, text
) from public, anon, authenticated;
grant execute on function private.lock_github_character(
  uuid, text
) to service_role;

create or replace function public.create_blessing_offering(
  p_auth_user_id uuid,
  p_provider_user_id text,
  p_idempotency_key uuid,
  p_random_value double precision,
  p_point_weights jsonb
)
returns table (
  offering_id uuid,
  offered_tokens text,
  claude_code_tokens text,
  codex_tokens text,
  awarded_points integer,
  created_at timestamptz,
  cooldown_ends_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_character public.characters%rowtype;
  existing_offering private.offerings%rowtype;
  created_offering private.offerings%rowtype;
  checked_at timestamptz := statement_timestamp();
  consumed_total bigint;
  consumed_claude bigint;
  consumed_codex bigint;
  point_weight jsonb;
  expected_point integer := 1;
  total_weight bigint := 0;
  cumulative_weight bigint := 0;
  selected_points integer;
  current_weight bigint;
begin
  if p_idempotency_key is null
    or p_random_value is null
    or p_random_value < 0
    or p_random_value >= 1
    or p_point_weights is null
    or jsonb_typeof(p_point_weights) <> 'array'
    or jsonb_array_length(p_point_weights) <> 3 then
    raise exception 'OFFERING_CONFIGURATION_INVALID' using errcode = 'P0001';
  end if;

  for point_weight in
    select value
    from jsonb_array_elements(p_point_weights)
    order by (value ->> 'points')::integer
  loop
    if jsonb_typeof(point_weight) <> 'object'
      or (select count(*) from jsonb_object_keys(point_weight)) <> 2
      or not point_weight ?& array['points', 'weight']
      or point_weight ->> 'points' !~ '^[1-3]$'
      or point_weight ->> 'weight' !~ '^[1-9][0-9]*$'
      or (point_weight ->> 'points')::integer <> expected_point then
      raise exception 'OFFERING_CONFIGURATION_INVALID' using errcode = 'P0001';
    end if;
    begin
      current_weight := (point_weight ->> 'weight')::bigint;
      total_weight := total_weight + current_weight;
    exception when others then
      raise exception 'OFFERING_CONFIGURATION_INVALID' using errcode = 'P0001';
    end;
    expected_point := expected_point + 1;
  end loop;

  if total_weight <= 0 or total_weight > 9007199254740991 then
    raise exception 'OFFERING_CONFIGURATION_INVALID' using errcode = 'P0001';
  end if;

  target_character := private.lock_github_character(
    p_auth_user_id,
    p_provider_user_id
  );

  select offering.*
    into existing_offering
    from private.offerings offering
    where offering.character_id = target_character.id
      and offering.idempotency_key = p_idempotency_key;

  if found then
    return query select
      existing_offering.id,
      existing_offering.offered_tokens::text,
      existing_offering.claude_code_tokens::text,
      existing_offering.codex_tokens::text,
      existing_offering.awarded_points,
      existing_offering.created_at,
      existing_offering.cooldown_ends_at,
      true;
    return;
  end if;

  if target_character.pending_points > 0 then
    raise exception 'OFFERING_PENDING_ALLOCATION' using errcode = 'P0001';
  end if;
  if target_character.cooldown_ends_at is not null
    and target_character.cooldown_ends_at > checked_at then
    raise exception 'OFFERING_COOLDOWN' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from private.collector_devices device
    where device.character_id = target_character.id
      and device.activated_at is not null
      and device.revoked_at is null
      and device.expired_at is null
      and not private.collector_device_should_expire(
        device.activated_at,
        device.activation_expires_at,
        device.last_successful_use_at,
        checked_at
      )
  ) then
    raise exception 'OFFERING_COLLECTOR_REQUIRED' using errcode = 'P0001';
  end if;

  with eligible as (
    select
      summary.id,
      summary.agent,
      summary.reported_total - summary.consumed_total as token_delta
    from private.hourly_usage_summaries summary
    join private.collector_devices device on device.id = summary.device_id
    where device.character_id = target_character.id
      and summary.reported_total > summary.consumed_total
    order by summary.id
    for update of summary
  ),
  consumed as (
    update private.hourly_usage_summaries summary
      set consumed_total = summary.reported_total,
          updated_at = checked_at
    from eligible
    where summary.id = eligible.id
    returning eligible.agent, eligible.token_delta
  )
  select
    coalesce(sum(token_delta), 0)::bigint,
    coalesce(sum(token_delta) filter (where agent = 'claude-code'), 0)::bigint,
    coalesce(sum(token_delta) filter (where agent = 'codex'), 0)::bigint
    into consumed_total, consumed_claude, consumed_codex
    from consumed;

  if consumed_total <= 0 then
    raise exception 'OFFERING_TOKENS_REQUIRED' using errcode = 'P0001';
  end if;
  if consumed_total > 9007199254740991
    or target_character.total_tokens_offered >
      9007199254740991 - consumed_total then
    raise exception 'OFFERING_TOKEN_LIMIT' using errcode = 'P0001';
  end if;

  expected_point := 1;
  for point_weight in
    select value
    from jsonb_array_elements(p_point_weights)
    order by (value ->> 'points')::integer
  loop
    current_weight := (point_weight ->> 'weight')::bigint;
    cumulative_weight := cumulative_weight + current_weight;
    if selected_points is null
      and p_random_value * total_weight < cumulative_weight then
      selected_points := expected_point;
    end if;
    expected_point := expected_point + 1;
  end loop;

  if selected_points is null then
    raise exception 'OFFERING_CONFIGURATION_INVALID' using errcode = 'P0001';
  end if;

  insert into private.offerings (
    character_id,
    idempotency_key,
    offered_tokens,
    claude_code_tokens,
    codex_tokens,
    awarded_points,
    created_at,
    cooldown_ends_at
  ) values (
    target_character.id,
    p_idempotency_key,
    consumed_total,
    consumed_claude,
    consumed_codex,
    selected_points,
    checked_at,
    checked_at + interval '12 hours'
  )
  returning * into created_offering;

  update public.characters character
    set total_tokens_offered =
          character.total_tokens_offered + consumed_total,
        claude_code_tokens_offered =
          character.claude_code_tokens_offered + consumed_claude,
        codex_tokens_offered =
          character.codex_tokens_offered + consumed_codex,
        offering_count = character.offering_count + 1,
        rank_eligible = true,
        cooldown_ends_at = created_offering.cooldown_ends_at,
        pending_points = selected_points,
        total_tokens_attained_at = checked_at,
        updated_at = checked_at
    where character.id = target_character.id;

  return query select
    created_offering.id,
    created_offering.offered_tokens::text,
    created_offering.claude_code_tokens::text,
    created_offering.codex_tokens::text,
    created_offering.awarded_points,
    created_offering.created_at,
    created_offering.cooldown_ends_at,
    false;
end;
$$;

revoke all on function public.create_blessing_offering(
  uuid, text, uuid, double precision, jsonb
) from public, anon, authenticated;
grant execute on function public.create_blessing_offering(
  uuid, text, uuid, double precision, jsonb
) to service_role;

create or replace function public.submit_blessing_allocation(
  p_auth_user_id uuid,
  p_provider_user_id text,
  p_offering_id uuid,
  p_allocation jsonb
)
returns table (
  courage integer,
  strength integer,
  wisdom integer,
  faith integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_character public.characters%rowtype;
  target_offering private.offerings%rowtype;
  checked_at timestamptz := statement_timestamp();
  courage_points integer;
  strength_points integer;
  wisdom_points integer;
  faith_points integer;
begin
  if p_offering_id is null
    or p_allocation is null
    or jsonb_typeof(p_allocation) <> 'object'
    or (select count(*) from jsonb_object_keys(p_allocation)) <> 4
    or not p_allocation ?& array['courage', 'strength', 'wisdom', 'faith']
    or p_allocation ->> 'courage' !~ '^[0-9]+$'
    or p_allocation ->> 'strength' !~ '^[0-9]+$'
    or p_allocation ->> 'wisdom' !~ '^[0-9]+$'
    or p_allocation ->> 'faith' !~ '^[0-9]+$' then
    raise exception 'BLESSING_ALLOCATION_INVALID' using errcode = 'P0001';
  end if;

  begin
    courage_points := (p_allocation ->> 'courage')::integer;
    strength_points := (p_allocation ->> 'strength')::integer;
    wisdom_points := (p_allocation ->> 'wisdom')::integer;
    faith_points := (p_allocation ->> 'faith')::integer;
  exception when others then
    raise exception 'BLESSING_ALLOCATION_INVALID' using errcode = 'P0001';
  end;

  target_character := private.lock_github_character(
    p_auth_user_id,
    p_provider_user_id
  );

  select offering.*
    into target_offering
    from private.offerings offering
    where offering.id = p_offering_id
      and offering.character_id = target_character.id
    for update;

  if not found then
    raise exception 'BLESSING_ALLOCATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if target_offering.acknowledged_at is not null then
    return query select
      target_character.courage,
      target_character.strength,
      target_character.wisdom,
      target_character.faith,
      true;
    return;
  end if;

  if target_character.pending_points <> target_offering.awarded_points
    or courage_points + strength_points + wisdom_points + faith_points
      <> target_character.pending_points then
    raise exception 'BLESSING_ALLOCATION_INVALID' using errcode = 'P0001';
  end if;

  update public.characters character
    set courage = character.courage + courage_points,
        strength = character.strength + strength_points,
        wisdom = character.wisdom + wisdom_points,
        faith = character.faith + faith_points,
        pending_points = 0,
        courage_attained_at = case
          when courage_points > 0 then checked_at
          else character.courage_attained_at
        end,
        strength_attained_at = case
          when strength_points > 0 then checked_at
          else character.strength_attained_at
        end,
        wisdom_attained_at = case
          when wisdom_points > 0 then checked_at
          else character.wisdom_attained_at
        end,
        faith_attained_at = case
          when faith_points > 0 then checked_at
          else character.faith_attained_at
        end,
        updated_at = checked_at
    where character.id = target_character.id
    returning * into target_character;

  update private.offerings offering
    set allocated_courage = courage_points,
        allocated_strength = strength_points,
        allocated_wisdom = wisdom_points,
        allocated_faith = faith_points,
        acknowledged_at = checked_at
    where offering.id = target_offering.id;

  return query select
    target_character.courage,
    target_character.strength,
    target_character.wisdom,
    target_character.faith,
    false;
end;
$$;

revoke all on function public.submit_blessing_allocation(
  uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_blessing_allocation(
  uuid, text, uuid, jsonb
) to service_role;

create or replace function public.get_my_temple_state()
returns table (
  character_id uuid,
  game_name text,
  courage integer,
  strength integer,
  wisdom integer,
  faith integer,
  total_tokens_offered text,
  claude_code_tokens_offered text,
  codex_tokens_offered text,
  offering_count integer,
  rank_eligible boolean,
  total_tokens_attained_at timestamptz,
  courage_attained_at timestamptz,
  strength_attained_at timestamptz,
  wisdom_attained_at timestamptz,
  faith_attained_at timestamptz,
  collector_connected boolean,
  eligible_tokens text,
  last_successful_sync_at timestamptz,
  collector_stale boolean,
  server_now timestamptz,
  cooldown_ends_at timestamptz,
  pending_offering_id uuid,
  pending_offered_tokens text,
  pending_claude_code_tokens text,
  pending_codex_tokens text,
  pending_points integer,
  pending_created_at timestamptz,
  can_offer boolean,
  offer_block_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_character as (
    select character.*
    from auth.identities auth_identity
    join private.character_identities identity
      on identity.auth_user_id = auth_identity.user_id
     and identity.provider = auth_identity.provider
     and identity.provider_user_id = auth_identity.provider_id
    join public.characters character on character.id = identity.character_id
    where auth_identity.user_id = auth.uid()
      and auth_identity.provider = 'github'
    limit 1
  ),
  device_state as (
    select
      coalesce(bool_or(
        device.activated_at is not null
        and device.revoked_at is null
        and device.expired_at is null
        and not private.collector_device_should_expire(
          device.activated_at,
          device.activation_expires_at,
          device.last_successful_use_at,
          statement_timestamp()
        )
      ), false) as connected,
      max(device.last_successful_sync_at) as last_sync,
      min(device.activated_at) filter (
        where device.activated_at is not null
          and device.revoked_at is null
          and device.expired_at is null
      ) as first_activation
    from current_character character
    left join private.collector_devices device
      on device.character_id = character.id
  ),
  game_state as (
    select
      character.*,
      device_state.connected,
      device_state.last_sync,
      device_state.first_activation,
      private.character_eligible_tokens(character.id) as eligible,
      offering.id as pending_id,
      offering.offered_tokens as pending_token_total,
      offering.claude_code_tokens as pending_claude_total,
      offering.codex_tokens as pending_codex_total,
      offering.awarded_points as pending_awarded_points,
      offering.created_at as pending_result_created_at
    from current_character character
    cross join device_state
    left join private.offerings offering
      on offering.character_id = character.id
     and offering.acknowledged_at is null
  )
  select
    game_state.id,
    game_state.game_name,
    game_state.courage,
    game_state.strength,
    game_state.wisdom,
    game_state.faith,
    game_state.total_tokens_offered::text,
    game_state.claude_code_tokens_offered::text,
    game_state.codex_tokens_offered::text,
    game_state.offering_count,
    game_state.rank_eligible,
    game_state.total_tokens_attained_at,
    game_state.courage_attained_at,
    game_state.strength_attained_at,
    game_state.wisdom_attained_at,
    game_state.faith_attained_at,
    game_state.connected,
    game_state.eligible::text,
    game_state.last_sync,
    game_state.connected
      and coalesce(game_state.last_sync, game_state.first_activation)
        < statement_timestamp() - interval '90 minutes',
    statement_timestamp(),
    game_state.cooldown_ends_at,
    game_state.pending_id,
    game_state.pending_token_total::text,
    game_state.pending_claude_total::text,
    game_state.pending_codex_total::text,
    coalesce(game_state.pending_awarded_points, 0),
    game_state.pending_result_created_at,
    game_state.pending_id is null
      and game_state.connected
      and game_state.eligible > 0
      and (
        game_state.cooldown_ends_at is null
        or game_state.cooldown_ends_at <= statement_timestamp()
      ),
    case
      when game_state.pending_id is not null then 'pending-allocation'
      when not game_state.connected then 'collector'
      when game_state.cooldown_ends_at is not null
        and game_state.cooldown_ends_at > statement_timestamp() then 'cooldown'
      when game_state.eligible <= 0 then 'tokens'
      else null
    end
  from game_state
$$;

revoke all on function public.get_my_temple_state() from public, anon;
grant execute on function public.get_my_temple_state() to authenticated;
