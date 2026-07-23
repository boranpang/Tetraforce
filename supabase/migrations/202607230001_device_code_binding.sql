create or replace function private.collector_device_is_inactive(
  p_last_successful_use_at timestamptz,
  p_checked_at timestamptz
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select p_last_successful_use_at <= p_checked_at - interval '90 days'
$$;

revoke all on function private.collector_device_is_inactive(timestamptz, timestamptz)
  from public, anon, authenticated;

create or replace function private.collector_device_should_expire(
  p_activated_at timestamptz,
  p_activation_expires_at timestamptz,
  p_last_successful_use_at timestamptz,
  p_checked_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_activated_at is null
      then p_activation_expires_at <= p_checked_at
    else private.collector_device_is_inactive(
      p_last_successful_use_at,
      p_checked_at
    )
  end
$$;

revoke all on function private.collector_device_should_expire(
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

create or replace function private.constant_time_text_equal(
  p_left text,
  p_right text
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  left_bytes bytea := convert_to(p_left, 'UTF8');
  right_bytes bytea := convert_to(p_right, 'UTF8');
  difference integer := octet_length(left_bytes) # octet_length(right_bytes);
  position integer;
begin
  if octet_length(left_bytes) <> octet_length(right_bytes) then
    return false;
  end if;

  for position in 0..octet_length(left_bytes) - 1 loop
    difference := difference |
      (get_byte(left_bytes, position) # get_byte(right_bytes, position));
  end loop;

  return difference = 0;
end;
$$;

revoke all on function private.constant_time_text_equal(text, text)
  from public, anon, authenticated;

create table private.collector_device_codes (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  code_digest text not null unique,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  invalidated_at timestamptz,
  constraint collector_device_codes_digest check (char_length(code_digest) = 43),
  constraint collector_device_codes_expiry check (expires_at > created_at),
  constraint collector_device_codes_single_terminal_state check (
    redeemed_at is null or invalidated_at is null
  )
);

create index collector_device_codes_character_id_idx
  on private.collector_device_codes(character_id);

create table private.collector_device_code_rate_limits (
  character_id uuid primary key references public.characters(id) on delete cascade,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0)
);

create table private.collector_device_request_rate_limits (
  operation text not null check (operation in ('exchange', 'activate', 'revoke')),
  request_key_digest text not null check (char_length(request_key_digest) = 43),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  primary key (operation, request_key_digest)
);

create table private.collector_devices (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  device_number integer not null check (device_number > 0),
  credential_selector text not null unique,
  credential_digest text not null,
  bound_at timestamptz not null default statement_timestamp(),
  last_successful_use_at timestamptz not null,
  earliest_accepted_utc_hour timestamptz not null,
  activation_expires_at timestamptz not null,
  activated_at timestamptz,
  revoked_at timestamptz,
  expired_at timestamptz,
  constraint collector_devices_character_number_key
    unique (character_id, device_number),
  constraint collector_devices_credential_digest check (
    char_length(credential_digest) = 43
  ),
  constraint collector_devices_time_order check (
    last_successful_use_at >= bound_at
    and earliest_accepted_utc_hour <= bound_at
    and activation_expires_at > bound_at
    and (activated_at is null or activated_at < activation_expires_at)
  ),
  constraint collector_devices_single_terminal_state check (
    revoked_at is null or expired_at is null
  )
);

create index collector_devices_character_id_idx
  on private.collector_devices(character_id);

alter table private.collector_device_codes enable row level security;
alter table private.collector_device_codes force row level security;
alter table private.collector_device_code_rate_limits enable row level security;
alter table private.collector_device_code_rate_limits force row level security;
alter table private.collector_device_request_rate_limits enable row level security;
alter table private.collector_device_request_rate_limits force row level security;
alter table private.collector_devices enable row level security;
alter table private.collector_devices force row level security;

revoke all on private.collector_device_codes from anon, authenticated;
revoke all on private.collector_device_code_rate_limits from anon, authenticated;
revoke all on private.collector_device_request_rate_limits from anon, authenticated;
revoke all on private.collector_devices from anon, authenticated;

create or replace function public.consume_collector_device_request_attempt(
  p_operation text,
  p_request_key_digest text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempts integer;
begin
  if p_operation not in ('exchange', 'activate', 'revoke')
    or char_length(p_request_key_digest) <> 43 then
    raise exception 'Collector device request is invalid.' using errcode = '22023';
  end if;

  insert into private.collector_device_request_rate_limits (
    operation,
    request_key_digest,
    window_started_at,
    attempt_count
  ) values (
    p_operation,
    p_request_key_digest,
    statement_timestamp(),
    1
  )
  on conflict (operation, request_key_digest) do update set
    window_started_at = case
      when private.collector_device_request_rate_limits.window_started_at
        <= statement_timestamp() - interval '15 minutes'
      then statement_timestamp()
      else private.collector_device_request_rate_limits.window_started_at
    end,
    attempt_count = case
      when private.collector_device_request_rate_limits.window_started_at
        <= statement_timestamp() - interval '15 minutes'
      then 1
      else private.collector_device_request_rate_limits.attempt_count + 1
    end
  returning attempt_count into attempts;

  if attempts > 20 then
    raise exception 'Too many Collector device requests.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.consume_collector_device_request_attempt(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_collector_device_request_attempt(text, text)
  to service_role;

create or replace function public.create_my_collector_device_code(
  p_code_digest text
)
returns table (
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bound_character_id uuid;
  created_expiry timestamptz := statement_timestamp() + interval '10 minutes';
  active_device_count integer;
  attempts integer;
begin
  select identity.character_id
    into bound_character_id
    from auth.identities auth_identity
    join private.character_identities identity
      on identity.auth_user_id = auth_identity.user_id
     and identity.provider = auth_identity.provider
     and identity.provider_user_id = auth_identity.provider_id
    where auth_identity.user_id = auth.uid()
      and auth_identity.provider = 'github'
    limit 1;

  if bound_character_id is null then
    raise exception 'Persistent Character is required.' using errcode = '42501';
  end if;

  perform 1
    from public.characters character
    where character.id = bound_character_id
    for update;

  update private.collector_devices device
    set expired_at = statement_timestamp()
    where device.character_id = bound_character_id
      and device.revoked_at is null
      and device.expired_at is null
      and private.collector_device_should_expire(
        device.activated_at,
        device.activation_expires_at,
        device.last_successful_use_at,
        statement_timestamp()
      );

  select count(*)::integer
    into active_device_count
    from private.collector_devices device
    where device.character_id = bound_character_id
      and device.revoked_at is null
      and device.expired_at is null
      and device.activated_at is not null;

  if active_device_count >= 5 then
    raise exception 'A Character can have at most five active devices.'
      using errcode = 'P0001';
  end if;

  insert into private.collector_device_code_rate_limits (
    character_id,
    window_started_at,
    attempt_count
  ) values (
    bound_character_id,
    statement_timestamp(),
    1
  )
  on conflict (character_id) do update set
    window_started_at = case
      when private.collector_device_code_rate_limits.window_started_at
        <= statement_timestamp() - interval '15 minutes'
      then statement_timestamp()
      else private.collector_device_code_rate_limits.window_started_at
    end,
    attempt_count = case
      when private.collector_device_code_rate_limits.window_started_at
        <= statement_timestamp() - interval '15 minutes'
      then 1
      else private.collector_device_code_rate_limits.attempt_count + 1
    end
  returning attempt_count into attempts;

  if attempts > 10 then
    raise exception 'Too many Device Code creation attempts.'
      using errcode = 'P0001';
  end if;

  update private.collector_device_codes code
    set invalidated_at = statement_timestamp()
    where code.character_id = bound_character_id
      and code.redeemed_at is null
      and code.invalidated_at is null;

  insert into private.collector_device_codes (
    character_id,
    code_digest,
    expires_at
  ) values (
    bound_character_id,
    p_code_digest,
    created_expiry
  );

  return query select created_expiry;
end;
$$;

revoke all on function public.create_my_collector_device_code(text)
  from public, anon;
grant execute on function public.create_my_collector_device_code(text)
  to authenticated;

create or replace function public.exchange_collector_device_code(
  p_code_digest text,
  p_credential_selector text,
  p_credential_digest text
)
returns table (
  device_id uuid,
  character_id uuid,
  device_number integer,
  bound_at timestamptz,
  earliest_accepted_utc_hour timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  code private.collector_device_codes%rowtype;
  target_character_id uuid;
  accepted_at timestamptz := statement_timestamp();
  earliest_hour timestamptz;
  next_device_number integer;
  created_device_id uuid;
  active_device_count integer;
begin
  select stored_code.character_id
    into target_character_id
    from private.collector_device_codes stored_code
    where stored_code.code_digest = p_code_digest;

  if target_character_id is null then
    raise exception 'Device code is invalid or expired.' using errcode = '22023';
  end if;

  perform 1
    from public.characters character
    where character.id = target_character_id
    for update;

  select stored_code.*
    into code
    from private.collector_device_codes stored_code
    where stored_code.code_digest = p_code_digest
      and stored_code.character_id = target_character_id
    for update;

  if not found
    or code.redeemed_at is not null
    or code.invalidated_at is not null
    or code.expires_at <= accepted_at then
    raise exception 'Device code is invalid or expired.' using errcode = '22023';
  end if;

  update private.collector_devices device
    set expired_at = accepted_at
    where device.character_id = code.character_id
      and device.revoked_at is null
      and device.expired_at is null
      and private.collector_device_should_expire(
        device.activated_at,
        device.activation_expires_at,
        device.last_successful_use_at,
        accepted_at
      );

  select count(*)::integer
    into active_device_count
    from private.collector_devices device
    where device.character_id = code.character_id
      and device.revoked_at is null
      and device.expired_at is null
      and device.activated_at is not null;

  if active_device_count >= 5 then
    raise exception 'A Character can have at most five active devices.'
      using errcode = 'P0001';
  end if;

  select coalesce(max(device.device_number), 0) + 1
    into next_device_number
    from private.collector_devices device
    where device.character_id = code.character_id;

  earliest_hour :=
    (
      date_trunc('hour', accepted_at at time zone 'UTC')
      at time zone 'UTC'
    ) - interval '23 hours';

  insert into private.collector_devices (
    character_id,
    device_number,
    credential_selector,
    credential_digest,
    bound_at,
    last_successful_use_at,
    earliest_accepted_utc_hour,
    activation_expires_at
  ) values (
    code.character_id,
    next_device_number,
    p_credential_selector,
    p_credential_digest,
    accepted_at,
    accepted_at,
    earliest_hour,
    accepted_at + interval '10 minutes'
  )
  returning id into created_device_id;

  update private.collector_device_codes stored_code
    set redeemed_at = accepted_at
    where stored_code.id = code.id;

  return query select
    created_device_id,
    code.character_id,
    next_device_number,
    accepted_at,
    earliest_hour;
end;
$$;

revoke all on function public.exchange_collector_device_code(text, text, text)
  from public, anon, authenticated;
grant execute on function public.exchange_collector_device_code(text, text, text)
  to service_role;

create or replace function public.activate_current_collector_device(
  p_credential_selector text,
  p_credential_digest text
)
returns table (
  activated boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_character_id uuid;
  device private.collector_devices%rowtype;
  checked_at timestamptz := statement_timestamp();
  active_device_count integer;
begin
  select stored_device.character_id
    into target_character_id
    from private.collector_devices stored_device
    where stored_device.credential_selector = p_credential_selector;

  if target_character_id is null then
    return query select false;
    return;
  end if;

  perform 1
    from public.characters character
    where character.id = target_character_id
    for update;

  select stored_device.*
    into device
    from private.collector_devices stored_device
    where stored_device.credential_selector = p_credential_selector
      and stored_device.character_id = target_character_id
    for update;

  if not found
    or not private.constant_time_text_equal(
      device.credential_digest,
      p_credential_digest
    )
    or device.revoked_at is not null
    or device.expired_at is not null then
    return query select false;
    return;
  end if;

  if private.collector_device_should_expire(
      device.activated_at,
      device.activation_expires_at,
      device.last_successful_use_at,
      checked_at
    ) then
    update private.collector_devices stored_device
      set expired_at = checked_at
      where stored_device.id = device.id;
    return query select false;
    return;
  end if;

  if device.activated_at is null then
    update private.collector_devices stored_device
      set expired_at = checked_at
      where stored_device.character_id = device.character_id
        and stored_device.revoked_at is null
        and stored_device.expired_at is null
        and stored_device.activated_at is not null
        and private.collector_device_should_expire(
          stored_device.activated_at,
          stored_device.activation_expires_at,
          stored_device.last_successful_use_at,
          checked_at
        );

    select count(*)::integer
      into active_device_count
      from private.collector_devices stored_device
      where stored_device.character_id = device.character_id
        and stored_device.revoked_at is null
        and stored_device.expired_at is null
        and stored_device.activated_at is not null;

    if active_device_count >= 5 then
      raise exception 'A Character can have at most five active devices.'
        using errcode = 'P0001';
    end if;
  end if;

  update private.collector_devices stored_device
    set activated_at = coalesce(stored_device.activated_at, checked_at),
        last_successful_use_at = checked_at
    where stored_device.id = device.id;

  return query select true;
end;
$$;

revoke all on function public.activate_current_collector_device(text, text)
  from public, anon, authenticated;
grant execute on function public.activate_current_collector_device(text, text)
  to service_role;

create or replace function public.revoke_current_collector_device(
  p_credential_selector text,
  p_credential_digest text
)
returns table (
  revoked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  device private.collector_devices%rowtype;
  checked_at timestamptz := statement_timestamp();
begin
  select stored_device.*
    into device
    from private.collector_devices stored_device
    where stored_device.credential_selector = p_credential_selector
    for update;

  if not found
    or not private.constant_time_text_equal(
      device.credential_digest,
      p_credential_digest
    )
    or device.revoked_at is not null
    or device.expired_at is not null then
    return query select false;
    return;
  end if;

  if private.collector_device_should_expire(
      device.activated_at,
      device.activation_expires_at,
      device.last_successful_use_at,
      checked_at
    ) then
    update private.collector_devices stored_device
      set expired_at = checked_at
      where stored_device.id = device.id;
    return query select false;
    return;
  end if;

  update private.collector_devices stored_device
    set revoked_at = checked_at
    where stored_device.id = device.id;

  return query select true;
end;
$$;

revoke all on function public.revoke_current_collector_device(text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_current_collector_device(text, text)
  to service_role;

create or replace function public.authenticate_collector_device(
  p_credential_selector text,
  p_credential_digest text
)
returns table (
  device_id uuid,
  character_id uuid,
  earliest_accepted_utc_hour timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  device private.collector_devices%rowtype;
  checked_at timestamptz := statement_timestamp();
begin
  select stored_device.*
    into device
    from private.collector_devices stored_device
    where stored_device.credential_selector = p_credential_selector
    for update;

  if not found
    or not private.constant_time_text_equal(
      device.credential_digest,
      p_credential_digest
    )
    or device.revoked_at is not null
    or device.expired_at is not null then
    return;
  end if;

  if private.collector_device_should_expire(
      device.activated_at,
      device.activation_expires_at,
      device.last_successful_use_at,
      checked_at
    ) then
    update private.collector_devices stored_device
      set expired_at = checked_at
      where stored_device.id = device.id;
    return;
  end if;

  if device.activated_at is null then
    return;
  end if;

  update private.collector_devices stored_device
    set last_successful_use_at = checked_at
    where stored_device.id = device.id;

  return query select
    device.id,
    device.character_id,
    device.earliest_accepted_utc_hour;
end;
$$;

revoke all on function public.authenticate_collector_device(text, text)
  from public, anon, authenticated;
grant execute on function public.authenticate_collector_device(text, text)
  to service_role;
