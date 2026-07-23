import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PLAYER_ONE = "4d4ce723-003d-43b2-8123-b8dc351abe0a";
const PLAYER_TWO = "ca2db7a0-90f8-4641-9743-48f9265ec942";
const migrations = [
  "202607220001_github_character_binding.sql",
  "202607230001_device_code_binding.sql",
  "202607230002_manual_sync_eligible_tokens.sql"
].map(
  (file) =>
    new URL(`../../../../supabase/migrations/${file}`, import.meta.url)
);

let database: PGlite;

beforeEach(async () => {
  database = new PGlite();
  await database.exec(`
    create role anon noinherit;
    create role authenticated noinherit;
    create role service_role noinherit bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table auth.identities (
      user_id uuid not null references auth.users(id),
      provider text not null,
      provider_id text not null
    );
    create function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  for (const migration of migrations) {
    await database.exec(await readFile(migration, "utf8"));
  }
  await database.query(`insert into auth.users (id) values ($1), ($2)`, [
    PLAYER_ONE,
    PLAYER_TWO
  ]);
  await database.query(
    `insert into auth.identities (user_id, provider, provider_id)
     values ($1, 'github', 'github-1'), ($2, 'github', 'github-2')`,
    [PLAYER_ONE, PLAYER_TWO]
  );
  await bindCharacter(PLAYER_ONE, "github-1", "Alice", "alice");
  await bindCharacter(PLAYER_TWO, "github-2", "Bob_2", "bob_2");
  await connectDevice(PLAYER_ONE, 1);
  await connectDevice(PLAYER_TWO, 2);
});

afterEach(async () => {
  await database.close();
});

describe("manual Usage Summary sync migration", () => {
  it("upserts cumulative summaries idempotently and exposes only the unconsumed growth", async () => {
    const first = summary({ inputTokens: 10 });

    expect(await sync(1, [first])).toMatchObject({
      accepted_summaries: 1,
      eligible_tokens: "15"
    });
    expect(await sync(1, [first])).toMatchObject({
      accepted_summaries: 1,
      eligible_tokens: "15"
    });

    await resetRole();
    await database.query(
      `update private.hourly_usage_summaries set consumed_total = reported_total`
    );

    expect(
      await sync(1, [summary({ inputTokens: 17 })])
    ).toMatchObject({
      accepted_summaries: 1,
      eligible_tokens: "7"
    });
    await becomePlayer(PLAYER_ONE);
    expect(
      (
        await database.query<{
          eligible_tokens: string;
          collector_connected: boolean;
          last_successful_sync_at: Date;
        }>(`select * from public.get_my_temple_sync_state()`)
      ).rows
    ).toMatchObject([
      {
        eligible_tokens: "7",
        collector_connected: true,
        last_successful_sync_at: expect.any(Date)
      }
    ]);
  });

  it("rejects counter rollback, invalid fields, negative values, and invalid device windows", async () => {
    await sync(1, [summary({ inputTokens: 10 })]);
    await expect(sync(1, [summary({ inputTokens: 9 })])).rejects.toThrow(
      "USAGE_COUNTER_ROLLBACK"
    );
    await expect(
      sync(1, [{ ...summary(), model: "private" }])
    ).rejects.toThrow("USAGE_SUMMARIES_INVALID");
    await expect(
      sync(1, [summary({ inputTokens: -1 })])
    ).rejects.toThrow("USAGE_SUMMARIES_INVALID");
    await expect(
      sync(1, [summary({ utcHour: shiftHour(currentUtcHour(), 1) })])
    ).rejects.toThrow("USAGE_WINDOW_INVALID");
    await expect(
      sync(1, [summary({ utcHour: shiftHour(currentUtcHour(), -24) })])
    ).rejects.toThrow("USAGE_WINDOW_INVALID");
    await resetRole();
    const boundary = await database.query<{ utc_hour: string }>(
      `select to_char(
         earliest_accepted_utc_hour at time zone 'UTC',
         'YYYY-MM-DD"T"HH24:00"Z"'
       ) as utc_hour
       from private.collector_devices
       where credential_selector = 'selector-1'`
    );
    await expect(
      sync(1, [
        summary({
          summaryKey: "b".repeat(43),
          utcHour: boundary.rows[0]!.utc_hour
        })
      ])
    ).resolves.toMatchObject({ accepted_summaries: 1 });
  });

  it("enforces device authentication, prior CLI summary shape, and consumed totals", async () => {
    await becomeService();
    await expect(
      database.query(
        `select * from public.sync_collector_usage_summaries($1, $2, '1.0.0', $3::jsonb)`,
        ["selector-1", "z".repeat(43), JSON.stringify([summary()])]
      )
    ).rejects.toThrow("DEVICE_CREDENTIAL_INVALID");
    await expect(
      sync(1, [summary({ collectorVersion: "0.9.0" })], "0.9.0")
    ).resolves.toMatchObject({
      accepted_summaries: 1
    });
    await resetRole();
    await expect(
      database.query(
        `update private.hourly_usage_summaries
         set consumed_total = reported_total + 1`
      )
    ).rejects.toThrow();
  });

  it("keeps private summaries isolated across players through RLS and owner-scoped state", async () => {
    await sync(1, [summary({ inputTokens: 20 })]);

    await becomePlayer(PLAYER_TWO);
    expect(
      (
        await database.query<{ eligible_tokens: string }>(
          `select * from public.get_my_temple_sync_state()`
        )
      ).rows
    ).toMatchObject([{ eligible_tokens: "0" }]);
    await expect(
      database.query(`select * from private.hourly_usage_summaries`)
    ).rejects.toThrow();
  });

  it("marks a connected Collector stale after 90 minutes without accepted data", async () => {
    await sync(1, [summary()]);
    await resetRole();
    await database.query(
      `update private.collector_devices
       set bound_at = statement_timestamp() - interval '2 hours',
           activated_at = statement_timestamp() - interval '2 hours',
           last_successful_sync_at = statement_timestamp() - interval '91 minutes',
           last_successful_use_at = statement_timestamp()
       where credential_selector = 'selector-1'`
    );
    await becomePlayer(PLAYER_ONE);
    expect(
      (
        await database.query<{ collector_stale: boolean }>(
          `select * from public.get_my_temple_sync_state()`
        )
      ).rows
    ).toMatchObject([{ collector_stale: true }]);
  });
});

async function sync(
  device: number,
  summaries: unknown[],
  version = "1.0.0"
) {
  await becomeService();
  const result = await database.query<{
    accepted_summaries: number;
    eligible_tokens: string;
    last_successful_sync_at: string;
  }>(
    `select * from public.sync_collector_usage_summaries($1, $2, $3, $4::jsonb)`,
    [
      `selector-${device}`,
      String.fromCharCode(96 + device).repeat(43),
      version,
      JSON.stringify(summaries)
    ]
  );
  return result.rows[0]!;
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    summaryKey: "s".repeat(43),
    agent: "codex",
    utcHour: currentUtcHour(),
    inputTokens: 10,
    outputTokens: 3,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
    collectorVersion: "1.0.0",
    sourceLogFormatVersion: "codex-rollout-v1",
    ...overrides
  };
}

function currentUtcHour() {
  return `${new Date().toISOString().slice(0, 13)}:00Z`;
}

function shiftHour(value: string, hours: number) {
  return `${new Date(Date.parse(value) + hours * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 13)}:00Z`;
}

async function connectDevice(authUserId: string, device: number) {
  const codeDigest = String(device).repeat(43);
  await becomePlayer(authUserId);
  await database.query(
    `select * from public.create_my_collector_device_code($1)`,
    [codeDigest]
  );
  await becomeService();
  await database.query(
    `select * from public.exchange_collector_device_code($1, $2, $3)`,
    [
      codeDigest,
      `selector-${device}`,
      String.fromCharCode(96 + device).repeat(43)
    ]
  );
  await database.query(
    `select * from public.activate_current_collector_device($1, $2)`,
    [
      `selector-${device}`,
      String.fromCharCode(96 + device).repeat(43)
    ]
  );
}

async function bindCharacter(
  authUserId: string,
  providerUserId: string,
  gameName: string,
  normalizedGameName: string
) {
  await becomeService();
  await database.query(
    `select * from public.complete_github_character_binding(
      $1, $2, $3, $4, 2, 2, 2, 2, '2026-07-22', '2026-07-22'
    )`,
    [authUserId, providerUserId, gameName, normalizedGameName]
  );
}

async function becomePlayer(authUserId: string) {
  await database.exec(`reset role`);
  await database.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
    authUserId
  ]);
  await database.exec(`set role authenticated`);
}

async function becomeService() {
  await database.exec(`reset role`);
  await database.exec(`set role service_role`);
}

async function resetRole() {
  await database.exec(`reset role`);
}
