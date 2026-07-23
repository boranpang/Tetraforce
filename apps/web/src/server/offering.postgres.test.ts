import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PLAYER_ID = "4d4ce723-003d-43b2-8123-b8dc351abe0a";
const enabled =
  process.env.TETRAFORCE_POSTGRES_CONCURRENCY_TESTS === "1" &&
  Boolean(process.env.TEST_DATABASE_URL);
const describePostgres = enabled ? describe : describe.skip;
const migrations = [
  "202607220001_github_character_binding.sql",
  "202607230001_device_code_binding.sql",
  "202607230002_manual_sync_eligible_tokens.sql",
  "202607230003_first_blessing_offering.sql"
].map(
  (file) =>
    new URL(`../../../../supabase/migrations/${file}`, import.meta.url)
);

let adminPool: Pool;
let databasePool: Pool;
let databaseName: string;

describePostgres("Blessing Offering on isolated PostgreSQL", () => {
  beforeAll(async () => {
    const adminUrl = process.env.TEST_DATABASE_URL!;
    databaseName = `tetraforce_offering_${process.pid}_${randomBytes(4).toString("hex")}`;
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
    await databasePool.query(`insert into auth.users (id) values ($1)`, [
      PLAYER_ID
    ]);
    await databasePool.query(
      `insert into auth.identities (user_id, provider, provider_id)
       values ($1, 'github', 'github-1')`,
      [PLAYER_ID]
    );
    await withRole("service_role", (client) =>
      client.query(
        `select * from public.complete_github_character_binding(
          $1, 'github-1', 'Alice', 'alice', 2, 2, 2, 2,
          '2026-07-22', '2026-07-22'
        )`,
        [PLAYER_ID]
      )
    );
    await connectDevice();
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
    await databasePool.query(`
      truncate private.offerings, private.hourly_usage_summaries;
      update public.characters
      set courage = 2,
          strength = 2,
          wisdom = 2,
          faith = 2,
          total_tokens_offered = 0,
          claude_code_tokens_offered = 0,
          codex_tokens_offered = 0,
          offering_count = 0,
          rank_eligible = false,
          cooldown_ends_at = null,
          pending_points = 0,
          total_tokens_attained_at = null,
          courage_attained_at = created_at,
          strength_attained_at = created_at,
          wisdom_attained_at = created_at,
          faith_attained_at = created_at;
    `);
  });

  it("returns one persisted result to simultaneous requests with the same key", async () => {
    await syncUsage(20);
    const key = "af0cad38-4ea5-40d7-81d7-e6beef58d1cb";
    const [first, second] = await Promise.all([
      withRole("service_role", (client) => createOffering(client, key)),
      withRole("service_role", (client) => createOffering(client, key))
    ]);

    expect(first.offering_id).toBe(second.offering_id);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(await getState()).toMatchObject({
      total_tokens_offered: "20",
      offering_count: 1,
      eligible_tokens: "0"
    });
  });

  it("allows only one simultaneous request with different keys to settle", async () => {
    await syncUsage(20);
    const attempts = await Promise.allSettled([
      withRole("service_role", (client) =>
        createOffering(client, "af0cad38-4ea5-40d7-81d7-e6beef58d1cb")
      ),
      withRole("service_role", (client) =>
        createOffering(client, "4beb4c83-cf17-4563-b915-2fd107f9c5d0")
      )
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await getState()).toMatchObject({
      total_tokens_offered: "20",
      offering_count: 1
    });
  });

  it("serializes sync growth and settlement without losing or double-consuming Tokens", async () => {
    await syncUsage(20);
    const attempts = await Promise.allSettled([
      syncUsage(30),
      withRole("service_role", (client) =>
        createOffering(client, "af0cad38-4ea5-40d7-81d7-e6beef58d1cb")
      )
    ]);
    expect(attempts.every(({ status }) => status === "fulfilled")).toBe(true);

    const state = await getState();
    expect(
      BigInt(String(state.total_tokens_offered)) +
        BigInt(String(state.eligible_tokens))
    ).toBe(30n);
    expect(state.offering_count).toBe(1);
  });
});

async function createOffering(client: PoolClient, key: string) {
  const result = await client.query<{
    offering_id: string;
    replayed: boolean;
  }>(
    `select * from public.create_blessing_offering(
      $1, 'github-1', $2, 0.5, $3::jsonb
    )`,
    [PLAYER_ID, key, JSON.stringify(pointWeights())]
  );
  return result.rows[0]!;
}

async function syncUsage(tokens: number) {
  return withRole("service_role", (client) =>
    client.query(
      `select * from public.sync_collector_usage_summaries(
        'selector-1', $1, '1.0.0', $2::jsonb
      )`,
      [
        "a".repeat(43),
        JSON.stringify([
          {
            summaryKey: "s".repeat(43),
            agent: "codex",
            utcHour: `${new Date().toISOString().slice(0, 13)}:00Z`,
            inputTokens: tokens,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            collectorVersion: "1.0.0",
            sourceLogFormatVersion: "codex-v1"
          }
        ])
      ]
    )
  );
}

async function getState() {
  return withRole("authenticated", async (client) => {
    await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      PLAYER_ID
    ]);
    const result = await client.query<Record<string, unknown>>(
      `select * from public.get_my_temple_state()`
    );
    return result.rows[0]!;
  });
}

async function connectDevice() {
  await withRole("authenticated", async (client) => {
    await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      PLAYER_ID
    ]);
    await client.query(
      `select * from public.create_my_collector_device_code($1)`,
      ["1".repeat(43)]
    );
  });
  await withRole("service_role", async (client) => {
    await client.query(
      `select * from public.exchange_collector_device_code($1, 'selector-1', $2)`,
      ["1".repeat(43), "a".repeat(43)]
    );
    await client.query(
      `select * from public.activate_current_collector_device('selector-1', $1)`,
      ["a".repeat(43)]
    );
  });
}

function pointWeights() {
  return [
    { points: 1, weight: 1 },
    { points: 2, weight: 2 },
    { points: 3, weight: 1 }
  ];
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
