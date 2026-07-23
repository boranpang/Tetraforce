import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PLAYER_ONE = "4d4ce723-003d-43b2-8123-b8dc351abe0a";
const PLAYER_TWO = "ca2db7a0-90f8-4641-9743-48f9265ec942";
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

type DeviceCodeRow = {
  expires_at: string;
};

type DeviceRow = {
  device_id: string;
  character_id: string;
  device_number: number;
  bound_at: string;
  earliest_accepted_utc_hour: string;
};

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
  await database.query(
    `insert into auth.users (id) values ($1), ($2)`,
    [PLAYER_ONE, PLAYER_TWO]
  );
  await database.query(
    `insert into auth.identities (user_id, provider, provider_id)
     values ($1, 'github', 'github-1'), ($2, 'github', 'github-2')`,
    [PLAYER_ONE, PLAYER_TWO]
  );
  await bindCharacter(PLAYER_ONE, "github-1", "Alice", "alice");
  await bindCharacter(PLAYER_TWO, "github-2", "Bob_2", "bob_2");
});

afterEach(async () => {
  await database.close();
});

describe("Collector device binding migration", () => {
  it("lets the current Character create one short-lived code and exchange it once", async () => {
    const codeDigest = "a".repeat(43);
    const credentialSelector = "selector-one";
    const credentialDigest = "b".repeat(43);

    await becomePlayer(PLAYER_ONE);
    const created = await database.query<DeviceCodeRow>(
      `select * from public.create_my_collector_device_code($1)`,
      [codeDigest]
    );
    expect(Date.parse(created.rows[0]!.expires_at) - Date.now()).toBeGreaterThan(
      9 * 60 * 1000
    );

    await becomeService();
    await database.exec(`set timezone = 'Asia/Kathmandu'`);
    const exchanged = await database.query<DeviceRow>(
      `select * from public.exchange_collector_device_code($1, $2, $3)`,
      [codeDigest, credentialSelector, credentialDigest]
    );
    expect(exchanged.rows).toMatchObject([
      {
        device_number: 1
      }
    ]);
    expect(
      Date.parse(exchanged.rows[0]!.bound_at) -
        Date.parse(exchanged.rows[0]!.earliest_accepted_utc_hour)
    ).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(
      new Date(exchanged.rows[0]!.earliest_accepted_utc_hour).getUTCMinutes()
    ).toBe(0);
    expect(
      (
        await database.query(
          `select * from public.authenticate_collector_device($1, $2)`,
          [credentialSelector, credentialDigest]
        )
      ).rows
    ).toEqual([]);
    expect(
      (
        await database.query<{ activated: boolean }>(
          `select * from public.activate_current_collector_device($1, $2)`,
          [credentialSelector, credentialDigest]
        )
      ).rows
    ).toEqual([{ activated: true }]);

    await expect(
      database.query(
        `select * from public.exchange_collector_device_code($1, $2, $3)`,
        [codeDigest, "selector-two", "c".repeat(43)]
      )
    ).rejects.toThrow("Device code is invalid or expired.");
  });

  it("does not count an unpersisted pending credential as active and expires it without activation", async () => {
    const pending = await exchangeDeviceWithoutActivation(PLAYER_ONE, 1);

    for (let device = 2; device <= 6; device += 1) {
      await createAndExchangeDevice(PLAYER_ONE, device);
    }

    await becomeService();
    await expect(
      database.query(
        `select * from public.activate_current_collector_device($1, $2)`,
        ["selector-1", "a".repeat(43)]
      )
    ).rejects.toThrow("A Character can have at most five active devices.");

    await resetRole();
    await database.query(
      `update private.collector_devices
       set bound_at = statement_timestamp() - interval '20 minutes',
           last_successful_use_at = statement_timestamp() - interval '20 minutes',
           earliest_accepted_utc_hour =
             date_trunc('hour', statement_timestamp() - interval '20 minutes')
             - interval '23 hours',
           activation_expires_at = statement_timestamp() - interval '10 minutes'
       where id = $1`,
      [pending.rows[0]!.device_id]
    );
    await becomeService();
    expect(
      (
        await database.query<{ activated: boolean }>(
          `select * from public.activate_current_collector_device($1, $2)`,
          ["selector-1", "a".repeat(43)]
        )
      ).rows
    ).toEqual([{ activated: false }]);
    await resetRole();
    expect(
      (
        await database.query<{ expired_at: string | null }>(
          `select expired_at from private.collector_devices where id = $1`,
          [pending.rows[0]!.device_id]
        )
      ).rows[0]!.expired_at
    ).not.toBeNull();
  });

  it("enforces five active devices and lets an inactive device expire", async () => {
    for (let device = 1; device <= 5; device += 1) {
      await createAndExchangeDevice(PLAYER_ONE, device);
    }

    await becomePlayer(PLAYER_ONE);
    await expect(
      database.query(
        `select * from public.create_my_collector_device_code($1)`,
        ["f".repeat(43)]
      )
    ).rejects.toThrow("A Character can have at most five active devices.");

    await resetRole();
    await database.exec(`
      update private.collector_devices
      set bound_at = statement_timestamp() - interval '100 days',
          last_successful_use_at = statement_timestamp() - interval '91 days',
          earliest_accepted_utc_hour =
            date_trunc('hour', statement_timestamp() - interval '100 days')
            - interval '23 hours'
      where device_number = 1
    `);

    await becomePlayer(PLAYER_ONE);
    await expect(
      database.query(
        `select * from public.create_my_collector_device_code($1)`,
        ["e".repeat(43)]
      )
    ).resolves.toMatchObject({ rows: [{ expires_at: expect.any(Date) }] });
  });

  it("revokes only the device presenting the matching credential digest", async () => {
    await createAndExchangeDevice(PLAYER_ONE, 1);
    await becomeService();

    const wrongCredential = await database.query<{ revoked: boolean }>(
      `select * from public.revoke_current_collector_device($1, $2)`,
      ["selector-1", "z".repeat(43)]
    );
    expect(wrongCredential.rows).toEqual([{ revoked: false }]);

    const revoked = await database.query<{ revoked: boolean }>(
      `select * from public.revoke_current_collector_device($1, $2)`,
      ["selector-1", "a".repeat(43)]
    );
    expect(revoked.rows).toEqual([{ revoked: true }]);

    const repeated = await database.query<{ revoked: boolean }>(
      `select * from public.revoke_current_collector_device($1, $2)`,
      ["selector-1", "a".repeat(43)]
    );
    expect(repeated.rows).toEqual([{ revoked: false }]);
  });

  it("accepts recent successful use but expires a credential at exactly 90 inactive days", async () => {
    const created = await createAndExchangeDevice(PLAYER_ONE, 1);
    await resetRole();
    await database.exec(`
      update private.collector_devices
      set bound_at = '2026-01-02T00:00:00Z',
          last_successful_use_at = statement_timestamp() - interval '89 days',
          earliest_accepted_utc_hour = '2026-01-01T00:00:00Z'
      where credential_selector = 'selector-1'
    `);

    await becomeService();
    const active = await database.query<{
      device_id: string;
      earliest_accepted_utc_hour: string;
    }>(
      `select * from public.authenticate_collector_device($1, $2)`,
      ["selector-1", "a".repeat(43)]
    );
    expect(active.rows).toHaveLength(1);
    expect(active.rows[0]!.device_id).toBe(created.rows[0]!.device_id);
    expect(new Date(active.rows[0]!.earliest_accepted_utc_hour).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );

    await resetRole();
    await database.exec(`
      update private.collector_devices
      set last_successful_use_at = statement_timestamp() - interval '90 days',
          expired_at = null
      where credential_selector = 'selector-1'
    `);

    await becomeService();
    const expired = await database.query(
      `select * from public.authenticate_collector_device($1, $2)`,
      ["selector-1", "a".repeat(43)]
    );
    expect(expired.rows).toEqual([]);
    const revokeExpired = await database.query<{ revoked: boolean }>(
      `select * from public.revoke_current_collector_device($1, $2)`,
      ["selector-1", "a".repeat(43)]
    );
    expect(revokeExpired.rows).toEqual([{ revoked: false }]);
  });

  it("rejects an expired device code without creating a device", async () => {
    const codeDigest = "x".repeat(43);
    await becomePlayer(PLAYER_ONE);
    await database.query(
      `select * from public.create_my_collector_device_code($1)`,
      [codeDigest]
    );
    await resetRole();
    await database.exec(`
      update private.collector_device_codes
      set created_at = statement_timestamp() - interval '20 minutes',
          expires_at = statement_timestamp() - interval '10 minutes'
      where code_digest = '${codeDigest}'
    `);

    await becomeService();
    await expect(
      database.query(
        `select * from public.exchange_collector_device_code($1, $2, $3)`,
        [codeDigest, "expired-selector", "y".repeat(43)]
      )
    ).rejects.toThrow("Device code is invalid or expired.");
  });

  it("allows exactly one winner when the same code is exchanged concurrently", async () => {
    const codeDigest = "q".repeat(43);
    await becomePlayer(PLAYER_ONE);
    await database.query(
      `select * from public.create_my_collector_device_code($1)`,
      [codeDigest]
    );
    await becomeService();

    const attempts = await Promise.allSettled([
      database.query(
        `select * from public.exchange_collector_device_code($1, $2, $3)`,
        [codeDigest, "concurrent-one", "r".repeat(43)]
      ),
      database.query(
        `select * from public.exchange_collector_device_code($1, $2, $3)`,
        [codeDigest, "concurrent-two", "s".repeat(43)]
      )
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
  });

  it("derives the Character from the authenticated creator and never from exchange input", async () => {
    await becomePlayer(PLAYER_ONE);
    const playerOne = await database.query<{ id: string }>(
      `select id from public.get_my_github_character()`
    );
    const codeDigest = "i".repeat(43);
    await database.query(
      `select * from public.create_my_collector_device_code($1)`,
      [codeDigest]
    );

    await becomePlayer(PLAYER_TWO);
    await expect(
      database.query(`select character_id from private.collector_device_codes`)
    ).rejects.toThrow(/permission denied/);

    await becomeService();
    const exchanged = await database.query<DeviceRow>(
      `select * from public.exchange_collector_device_code($1, $2, $3)`,
      [codeDigest, "identity-selector", "j".repeat(43)]
    );
    expect(exchanged.rows[0]!.character_id).toBe(playerOne.rows[0]!.id);
  });

  it("limits one Character to ten Device Code creations per fifteen minutes", async () => {
    await becomePlayer(PLAYER_ONE);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await database.query(
        `select * from public.create_my_collector_device_code($1)`,
        [String.fromCharCode(65 + attempt).repeat(43)]
      );
    }

    await expect(
      database.query(
        `select * from public.create_my_collector_device_code($1)`,
        ["z".repeat(43)]
      )
    ).rejects.toThrow("Too many Device Code creation attempts.");
  });

  it("rate limits anonymous exchange and revoke request keys", async () => {
    await becomeService();
    for (const operation of ["exchange", "activate", "revoke"] as const) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await database.query(
          `select public.consume_collector_device_request_attempt($1, $2)`,
          [operation, operation[0]!.repeat(43)]
        );
      }
      await expect(
        database.query(
          `select public.consume_collector_device_request_attempt($1, $2)`,
          [operation, operation[0]!.repeat(43)]
        )
      ).rejects.toThrow("Too many Collector device requests.");
    }
  });
});

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

async function createAndExchangeDevice(authUserId: string, device: number) {
  const exchanged = await exchangeDeviceWithoutActivation(authUserId, device);
  await database.query(
    `select * from public.activate_current_collector_device($1, $2)`,
    [`selector-${device}`, String.fromCharCode(96 + device).repeat(43)]
  );
  return exchanged;
}

async function exchangeDeviceWithoutActivation(
  authUserId: string,
  device: number
) {
  const codeDigest = String(device).repeat(43);
  await becomePlayer(authUserId);
  await database.query(
    `select * from public.create_my_collector_device_code($1)`,
    [codeDigest]
  );
  await becomeService();
  return database.query<DeviceRow>(
    `select * from public.exchange_collector_device_code($1, $2, $3)`,
    [codeDigest, `selector-${device}`, String.fromCharCode(96 + device).repeat(43)]
  );
}

async function becomePlayer(authUserId: string) {
  await resetRole();
  await database.exec(`set role authenticated`);
  await database.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
    authUserId
  ]);
}

async function becomeService() {
  await resetRole();
  await database.exec(`set role service_role`);
}

async function resetRole() {
  await database.exec(`reset role`);
}
