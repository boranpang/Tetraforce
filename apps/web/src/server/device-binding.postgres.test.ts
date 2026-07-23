import { readFile } from "node:fs/promises";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PLAYER = "4d4ce723-003d-43b2-8123-b8dc351abe0a";
const enabled =
  process.env.TETRAFORCE_POSTGRES_CONCURRENCY_TESTS === "1" &&
  Boolean(process.env.TEST_DATABASE_URL);
const describePostgres = enabled ? describe : describe.skip;
const migrations = [
  new URL(
    "../../../../supabase/migrations/202607220001_github_character_binding.sql",
    import.meta.url
  ),
  new URL(
    "../../../../supabase/migrations/202607230001_device_code_binding.sql",
    import.meta.url
  )
];

let pool: Pool;

describePostgres("Collector device binding on PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query(`
      drop schema if exists private cascade;
      drop schema if exists auth cascade;
      drop schema public cascade;
      create schema public;
      create schema auth;
      do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end $$;
      grant usage on schema public to anon, authenticated, service_role;
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
      await pool.query(await readFile(migration, "utf8"));
    }
    await pool.query(`insert into auth.users (id) values ($1)`, [PLAYER]);
    await pool.query(
      `insert into auth.identities (user_id, provider, provider_id)
       values ($1, 'github', 'github-1')`,
      [PLAYER]
    );
    await withRole("service_role", async (client) => {
      await client.query(
        `select * from public.complete_github_character_binding(
          $1, 'github-1', 'Alice', 'alice', 2, 2, 2, 2,
          '2026-07-22', '2026-07-22'
        )`,
        [PLAYER]
      );
    });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query(`
      truncate private.collector_devices,
        private.collector_device_codes,
        private.collector_device_code_rate_limits,
        private.collector_device_request_rate_limits
    `);
  });

  it("commits exactly one device across two simultaneous exchange sessions", async () => {
    const codeDigest = "w".repeat(43);
    await withRole("authenticated", async (client) => {
      await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
        PLAYER
      ]);
      await client.query(
        `select * from public.create_my_collector_device_code($1::text)`,
        [codeDigest]
      );
    });

    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query(`set role service_role`);
      await second.query(`set role service_role`);
      const attempts = await Promise.allSettled([
        first.query(
          `select * from public.exchange_collector_device_code(
            $1::text, 'postgres-one', $2::text
          )`,
          [codeDigest, "x".repeat(43)]
        ),
        second.query(
          `select * from public.exchange_collector_device_code(
            $1::text, 'postgres-two', $2::text
          )`,
          [codeDigest, "y".repeat(43)]
        )
      ]);

      expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
      const count = await pool.query<{ count: number }>(
        `select count(*)::integer as count from private.collector_devices`
      );
      expect(count.rows).toEqual([{ count: 1 }]);
    } finally {
      await first.query(`reset role`);
      await second.query(`reset role`);
      first.release();
      second.release();
    }
  });

  it("allows only one of two pending devices to claim the fifth active slot", async () => {
    for (let device = 1; device <= 4; device += 1) {
      await createPendingDevice(device);
      await activateDevice(device);
    }
    await createPendingDevice(5);
    await createPendingDevice(6);

    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query(`set role service_role`);
      await second.query(`set role service_role`);
      const attempts = await Promise.allSettled([
        first.query(
          `select * from public.activate_current_collector_device($1, $2)`,
          ["postgres-selector-5", "e".repeat(43)]
        ),
        second.query(
          `select * from public.activate_current_collector_device($1, $2)`,
          ["postgres-selector-6", "f".repeat(43)]
        )
      ]);

      expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
      const count = await pool.query<{ count: number }>(
        `select count(*)::integer as count
         from private.collector_devices
         where activated_at is not null
           and revoked_at is null
           and expired_at is null`
      );
      expect(count.rows).toEqual([{ count: 5 }]);
    } finally {
      await first.query(`reset role`);
      await second.query(`reset role`);
      first.release();
      second.release();
    }
  });
});

async function createPendingDevice(device: number) {
  const codeDigest = String(device).repeat(43);
  await withRole("authenticated", async (client) => {
    await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      PLAYER
    ]);
    await client.query(
      `select * from public.create_my_collector_device_code($1::text)`,
      [codeDigest]
    );
  });
  await withRole("service_role", (client) =>
    client.query(
      `select * from public.exchange_collector_device_code(
        $1::text, $2::text, $3::text
      )`,
      [
        codeDigest,
        `postgres-selector-${device}`,
        String.fromCharCode(96 + device).repeat(43)
      ]
    )
  );
}

async function activateDevice(device: number) {
  await withRole("service_role", (client) =>
    client.query(
      `select * from public.activate_current_collector_device($1, $2)`,
      [
        `postgres-selector-${device}`,
        String.fromCharCode(96 + device).repeat(43)
      ]
    )
  );
}

async function withRole<T>(
  role: "authenticated" | "service_role",
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect();
  try {
    await client.query(`set role ${role}`);
    return await operation(client);
  } finally {
    await client.query(`reset role`);
    client.release();
  }
}
