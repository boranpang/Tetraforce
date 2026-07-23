import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PLAYER_ONE = "4d4ce723-003d-43b2-8123-b8dc351abe0a";
const PLAYER_TWO = "ca2db7a0-90f8-4641-9743-48f9265ec942";
const enabled =
  process.env.TETRAFORCE_POSTGRES_CONCURRENCY_TESTS === "1" &&
  Boolean(process.env.TEST_DATABASE_URL);
const describePostgres = enabled ? describe : describe.skip;
const migrations = [
  "202607220001_github_character_binding.sql",
  "202607230001_device_code_binding.sql",
  "202607230002_manual_sync_eligible_tokens.sql"
].map(
  (file) =>
    new URL(`../../../../supabase/migrations/${file}`, import.meta.url)
);

let adminPool: Pool;
let databasePool: Pool;
let databaseName: string;

describePostgres("manual Usage Summary sync on isolated PostgreSQL", () => {
  beforeAll(async () => {
    const adminUrl = process.env.TEST_DATABASE_URL!;
    databaseName = `tetraforce_sync_${process.pid}_${randomBytes(4).toString("hex")}`;
    adminPool = new Pool({ connectionString: adminUrl });
    await adminPool.query(`create database "${databaseName}"`);

    const databaseUrl = new URL(adminUrl);
    databaseUrl.pathname = `/${databaseName}`;
    databasePool = new Pool({ connectionString: databaseUrl.toString() });
    await databasePool.query(`
      do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end $$;
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
      grant usage on schema public to anon, authenticated, service_role;
    `);
    for (const migration of migrations) {
      await databasePool.query(await readFile(migration, "utf8"));
    }
    await databasePool.query(`insert into auth.users (id) values ($1), ($2)`, [
      PLAYER_ONE,
      PLAYER_TWO
    ]);
    await databasePool.query(
      `insert into auth.identities (user_id, provider, provider_id)
       values ($1, 'github', 'github-1'), ($2, 'github', 'github-2')`,
      [PLAYER_ONE, PLAYER_TWO]
    );
    await bindCharacter(PLAYER_ONE, "github-1", "Alice", "alice");
    await bindCharacter(PLAYER_TWO, "github-2", "Bob_2", "bob_2");
    await connectDevice(PLAYER_ONE, 1);
    await connectDevice(PLAYER_TWO, 2);
  }, 30_000);

  afterAll(async () => {
    await databasePool?.end();
    if (adminPool && databaseName) {
      await adminPool.query(
        `select pg_terminate_backend(pid)
         from pg_stat_activity
         where datname = $1 and pid <> pg_backend_pid()`,
        [databaseName]
      );
      await adminPool.query(`drop database if exists "${databaseName}"`);
    }
    await adminPool?.end();
  });

  beforeEach(async () => {
    await databasePool.query(`truncate private.hourly_usage_summaries`);
  });

  it("keeps replays idempotent and serializes concurrent cumulative growth", async () => {
    expect(await sync(1, [summary({ inputTokens: 10 })])).toMatchObject({
      eligible_tokens: "15"
    });
    expect(await sync(1, [summary({ inputTokens: 10 })])).toMatchObject({
      eligible_tokens: "15"
    });

    const first = databasePool.connect();
    const second = databasePool.connect();
    const [firstClient, secondClient] = await Promise.all([first, second]);
    try {
      await firstClient.query(`set role service_role`);
      await secondClient.query(`set role service_role`);
      const attempts = await Promise.allSettled([
        syncWithClient(firstClient, [summary({ inputTokens: 20 })]),
        syncWithClient(secondClient, [summary({ inputTokens: 30 })])
      ]);
      expect(attempts.some(({ status }) => status === "fulfilled")).toBe(true);
    } finally {
      await firstClient.query(`reset role`);
      await secondClient.query(`reset role`);
      firstClient.release();
      secondClient.release();
    }

    const stored = await databasePool.query<{ reported_total: string }>(
      `select reported_total::text from private.hourly_usage_summaries`
    );
    expect(stored.rows).toEqual([{ reported_total: "35" }]);
  });

  it("rejects rollback, invalid windows, and fields outside the allowlist", async () => {
    await sync(1, [summary({ inputTokens: 10 })]);
    await expect(sync(1, [summary({ inputTokens: 9 })])).rejects.toThrow(
      "USAGE_COUNTER_ROLLBACK"
    );
    await expect(
      sync(1, [{ ...summary(), model: "private-model" }])
    ).rejects.toThrow("USAGE_SUMMARIES_INVALID");
    await expect(
      sync(1, [summary({ utcHour: shiftHour(currentUtcHour(), 1) })])
    ).rejects.toThrow("USAGE_WINDOW_INVALID");
    await expect(
      sync(1, [summary({ utcHour: shiftHour(currentUtcHour(), -24) })])
    ).rejects.toThrow("USAGE_WINDOW_INVALID");
    const boundary = await databasePool.query<{ utc_hour: string }>(
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

  it("prevents cross-player RLS access and returns only owner-scoped Eligible Tokens", async () => {
    await sync(1, [summary({ inputTokens: 40 })]);

    await databasePool.query(
      `grant select, insert, update on private.hourly_usage_summaries to authenticated`
    );
    try {
      await withRole("authenticated", async (client) => {
        await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
          PLAYER_TWO
        ]);
        const state = await client.query<{ eligible_tokens: string }>(
          `select * from public.get_my_temple_sync_state()`
        );
        expect(state.rows).toMatchObject([{ eligible_tokens: "0" }]);
        expect(
          (await client.query(`select * from private.hourly_usage_summaries`)).rows
        ).toEqual([]);
        expect(
          (
            await client.query(
              `update private.hourly_usage_summaries set consumed_total = 0`
            )
          ).rowCount
        ).toBe(0);
        await expect(
          client.query(`insert into private.hourly_usage_summaries default values`)
        ).rejects.toThrow();
      });
    } finally {
      await databasePool.query(
        `revoke select, insert, update on private.hourly_usage_summaries from authenticated`
      );
    }
  });
});

async function sync(device: number, summaries: unknown[]) {
  return withRole("service_role", async (client) => {
    const result = await syncWithClient(client, summaries, device);
    return result.rows[0]!;
  });
}

function syncWithClient(
  client: PoolClient,
  summaries: unknown[],
  device = 1
) {
  return client.query<{
    accepted_summaries: number;
    eligible_tokens: string;
  }>(
    `select * from public.sync_collector_usage_summaries($1, $2, '1.0.0', $3::jsonb)`,
    [
      `selector-${device}`,
      String.fromCharCode(96 + device).repeat(43),
      JSON.stringify(summaries)
    ]
  );
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
  await withRole("authenticated", async (client) => {
    await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      authUserId
    ]);
    await client.query(
      `select * from public.create_my_collector_device_code($1)`,
      [codeDigest]
    );
  });
  await withRole("service_role", async (client) => {
    await client.query(
      `select * from public.exchange_collector_device_code($1, $2, $3)`,
      [
        codeDigest,
        `selector-${device}`,
        String.fromCharCode(96 + device).repeat(43)
      ]
    );
    await client.query(
      `select * from public.activate_current_collector_device($1, $2)`,
      [
        `selector-${device}`,
        String.fromCharCode(96 + device).repeat(43)
      ]
    );
  });
}

async function bindCharacter(
  authUserId: string,
  providerUserId: string,
  gameName: string,
  normalizedGameName: string
) {
  await withRole("service_role", (client) =>
    client.query(
      `select * from public.complete_github_character_binding(
        $1, $2, $3, $4, 2, 2, 2, 2, '2026-07-22', '2026-07-22'
      )`,
      [authUserId, providerUserId, gameName, normalizedGameName]
    )
  );
}

async function withRole<T>(
  role: "authenticated" | "service_role",
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await databasePool.connect();
  try {
    await client.query(`set role ${role}`);
    return await operation(client);
  } finally {
    await client.query(`reset role`);
    client.release();
  }
}
