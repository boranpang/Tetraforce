alter table private.collector_devices
  add column last_successful_sync_at timestamptz;

alter table private.collector_devices
  add constraint collector_devices_sync_time_order check (
    last_successful_sync_at is null
    or (
      last_successful_sync_at >= bound_at
      and last_successful_sync_at <= last_successful_use_at
    )
  );

create table private.hourly_usage_summaries (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references private.collector_devices(id) on delete cascade,
  summary_key text not null,
  agent text not null check (agent in ('claude-code', 'codex')),
  utc_hour timestamptz not null,
  input_tokens bigint not null check (input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  cache_read_tokens bigint not null check (cache_read_tokens >= 0),
  cache_write_tokens bigint not null check (cache_write_tokens >= 0),
  reported_total bigint not null check (
    reported_total >= 0
    and reported_total <= 9007199254740991
  ),
  consumed_total bigint not null default 0 check (
    consumed_total >= 0
    and consumed_total <= reported_total
  ),
  collector_version text not null,
  source_log_format_version text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint hourly_usage_summaries_device_agent_hour_key
    unique (device_id, agent, utc_hour),
  constraint hourly_usage_summaries_device_summary_key
    unique (device_id, summary_key),
  constraint hourly_usage_summaries_summary_key_format check (
    summary_key ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint hourly_usage_summaries_hour_boundary check (
    utc_hour = date_trunc('hour', utc_hour)
  ),
  constraint hourly_usage_summaries_reported_total_matches check (
    reported_total =
      input_tokens + output_tokens + cache_read_tokens + cache_write_tokens
  )
);

create index hourly_usage_summaries_device_id_idx
  on private.hourly_usage_summaries(device_id);

alter table private.hourly_usage_summaries enable row level security;
alter table private.hourly_usage_summaries force row level security;
revoke all on private.hourly_usage_summaries from anon, authenticated;

create or replace function private.character_eligible_tokens(
  p_character_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(summary.reported_total - summary.consumed_total), 0)::bigint
  from private.hourly_usage_summaries summary
  join private.collector_devices device on device.id = summary.device_id
  where device.character_id = p_character_id
$$;

revoke all on function private.character_eligible_tokens(uuid)
  from public, anon, authenticated;

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
  device private.collector_devices%rowtype;
  checked_at timestamptz := statement_timestamp();
  current_utc_hour timestamptz :=
    date_trunc('hour', checked_at at time zone 'UTC') at time zone 'UTC';
  summary jsonb;
  summary_hour timestamptz;
  summary_agent text;
  incoming_summary_key text;
  source_version text;
  input_count bigint;
  output_count bigint;
  cache_read_count bigint;
  cache_write_count bigint;
  reported_count bigint;
  written_id uuid;
  item_count integer;
begin
  if p_collector_version is null
    or p_collector_version !~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$' then
    raise exception 'COLLECTOR_UPGRADE_REQUIRED' using errcode = 'P0001';
  end if;
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
    or device.activated_at is null
    or device.revoked_at is not null
    or device.expired_at is not null then
    raise exception 'DEVICE_CREDENTIAL_INVALID' using errcode = 'P0001';
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
    raise exception 'DEVICE_CREDENTIAL_INVALID' using errcode = 'P0001';
  end if;

  if p_summaries is null or jsonb_typeof(p_summaries) <> 'array' then
    raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
  end if;
  item_count := jsonb_array_length(p_summaries);
  if item_count < 1 or item_count > 500 then
    raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
  end if;

  for summary in select value from jsonb_array_elements(p_summaries) loop
    if jsonb_typeof(summary) <> 'object'
      or (select count(*) from jsonb_object_keys(summary)) <> 9
      or not summary ?& array[
        'summaryKey',
        'agent',
        'utcHour',
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheWriteTokens',
        'collectorVersion',
        'sourceLogFormatVersion'
      ] then
      raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
    end if;

    if jsonb_typeof(summary -> 'summaryKey') <> 'string'
      or jsonb_typeof(summary -> 'agent') <> 'string'
      or jsonb_typeof(summary -> 'utcHour') <> 'string'
      or jsonb_typeof(summary -> 'collectorVersion') <> 'string'
      or jsonb_typeof(summary -> 'sourceLogFormatVersion') <> 'string'
      or jsonb_typeof(summary -> 'inputTokens') <> 'number'
      or jsonb_typeof(summary -> 'outputTokens') <> 'number'
      or jsonb_typeof(summary -> 'cacheReadTokens') <> 'number'
      or jsonb_typeof(summary -> 'cacheWriteTokens') <> 'number' then
      raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
    end if;

    incoming_summary_key := summary ->> 'summaryKey';
    summary_agent := summary ->> 'agent';
    source_version := summary ->> 'sourceLogFormatVersion';
    if incoming_summary_key !~ '^[A-Za-z0-9_-]{43}$'
      or summary_agent not in ('claude-code', 'codex')
      or summary ->> 'collectorVersion' <> p_collector_version
      or char_length(source_version) < 1
      or char_length(source_version) > 64
      or source_version !~ '^[A-Za-z0-9._-]+$'
      or summary ->> 'utcHour' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:00Z$'
      or summary ->> 'inputTokens' !~ '^[0-9]+$'
      or summary ->> 'outputTokens' !~ '^[0-9]+$'
      or summary ->> 'cacheReadTokens' !~ '^[0-9]+$'
      or summary ->> 'cacheWriteTokens' !~ '^[0-9]+$' then
      raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
    end if;

    begin
      summary_hour := (summary ->> 'utcHour')::timestamptz;
      input_count := (summary ->> 'inputTokens')::bigint;
      output_count := (summary ->> 'outputTokens')::bigint;
      cache_read_count := (summary ->> 'cacheReadTokens')::bigint;
      cache_write_count := (summary ->> 'cacheWriteTokens')::bigint;
      reported_count :=
        input_count + output_count + cache_read_count + cache_write_count;
    exception when others then
      raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
    end;

    if reported_count > 9007199254740991 then
      raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
    end if;
    if summary_hour < device.earliest_accepted_utc_hour
      or summary_hour > current_utc_hour then
      raise exception 'USAGE_WINDOW_INVALID' using errcode = 'P0001';
    end if;
    if exists (
      select 1
      from private.hourly_usage_summaries stored_summary
      where stored_summary.device_id = device.id
        and stored_summary.summary_key = incoming_summary_key
        and (
          stored_summary.agent <> summary_agent
          or stored_summary.utc_hour <> summary_hour
        )
    ) then
      raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
    end if;

    written_id := null;
    insert into private.hourly_usage_summaries (
      device_id,
      summary_key,
      agent,
      utc_hour,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_write_tokens,
      reported_total,
      collector_version,
      source_log_format_version
    ) values (
      device.id,
      incoming_summary_key,
      summary_agent,
      summary_hour,
      input_count,
      output_count,
      cache_read_count,
      cache_write_count,
      reported_count,
      p_collector_version,
      source_version
    )
    on conflict (device_id, agent, utc_hour) do update set
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      cache_write_tokens = excluded.cache_write_tokens,
      reported_total = excluded.reported_total,
      collector_version = excluded.collector_version,
      source_log_format_version = excluded.source_log_format_version,
      updated_at = case
        when private.hourly_usage_summaries.reported_total < excluded.reported_total
          then checked_at
        else private.hourly_usage_summaries.updated_at
      end
    where private.hourly_usage_summaries.summary_key = excluded.summary_key
      and private.hourly_usage_summaries.input_tokens <= excluded.input_tokens
      and private.hourly_usage_summaries.output_tokens <= excluded.output_tokens
      and private.hourly_usage_summaries.cache_read_tokens <= excluded.cache_read_tokens
      and private.hourly_usage_summaries.cache_write_tokens <= excluded.cache_write_tokens
    returning id into written_id;

    if written_id is null then
      if exists (
        select 1
        from private.hourly_usage_summaries stored_summary
        where stored_summary.device_id = device.id
          and stored_summary.agent = summary_agent
          and stored_summary.utc_hour = summary_hour
          and stored_summary.summary_key <> incoming_summary_key
      ) then
        raise exception 'USAGE_SUMMARIES_INVALID' using errcode = 'P0001';
      end if;
      raise exception 'USAGE_COUNTER_ROLLBACK' using errcode = 'P0001';
    end if;
  end loop;

  update private.collector_devices stored_device
    set last_successful_use_at = checked_at,
        last_successful_sync_at = checked_at
    where stored_device.id = device.id;

  return query select
    item_count,
    private.character_eligible_tokens(device.character_id)::text,
    checked_at;
end;
$$;

revoke all on function public.sync_collector_usage_summaries(
  text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.sync_collector_usage_summaries(
  text, text, text, jsonb
) to service_role;

create or replace function public.get_my_temple_sync_state()
returns table (
  collector_connected boolean,
  eligible_tokens text,
  last_successful_sync_at timestamptz,
  collector_stale boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_character as (
    select identity.character_id
    from auth.identities auth_identity
    join private.character_identities identity
      on identity.auth_user_id = auth_identity.user_id
     and identity.provider = auth_identity.provider
     and identity.provider_user_id = auth_identity.provider_id
    where auth_identity.user_id = auth.uid()
      and auth_identity.provider = 'github'
    limit 1
  ),
  device_state as (
    select
      bool_or(
        device.activated_at is not null
        and device.revoked_at is null
        and device.expired_at is null
        and not private.collector_device_should_expire(
          device.activated_at,
          device.activation_expires_at,
          device.last_successful_use_at,
          statement_timestamp()
        )
      ) as connected,
      max(device.last_successful_sync_at) as last_sync,
      min(device.activated_at) filter (
        where device.activated_at is not null
          and device.revoked_at is null
          and device.expired_at is null
      ) as first_activation
    from current_character character
    left join private.collector_devices device
      on device.character_id = character.character_id
  )
  select
    coalesce(device_state.connected, false),
    private.character_eligible_tokens(character.character_id)::text,
    device_state.last_sync,
    coalesce(device_state.connected, false)
      and coalesce(device_state.last_sync, device_state.first_activation)
        < statement_timestamp() - interval '90 minutes'
  from current_character character
  cross join device_state
$$;

revoke all on function public.get_my_temple_sync_state() from public, anon;
grant execute on function public.get_my_temple_sync_state() to authenticated;
