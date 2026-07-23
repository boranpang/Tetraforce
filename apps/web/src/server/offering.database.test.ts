import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PLAYER_ID = "4d4ce723-003d-43b2-8123-b8dc351abe0a";
const OFFERING_KEY = "af0cad38-4ea5-40d7-81d7-e6beef58d1cb";
const migrations = [
  "202607220001_github_character_binding.sql",
  "202607230001_device_code_binding.sql",
  "202607230002_manual_sync_eligible_tokens.sql",
  "202607230003_first_blessing_offering.sql"
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
  await database.query(`insert into auth.users (id) values ($1)`, [PLAYER_ID]);
  await database.query(
    `insert into auth.identities (user_id, provider, provider_id)
     values ($1, 'github', 'github-1')`,
    [PLAYER_ID]
  );
  await becomeService();
  await database.query(
    `select * from public.complete_github_character_binding(
      $1, 'github-1', 'Alice', 'alice', 2, 2, 2, 2, '2026-07-22', '2026-07-22'
    )`,
    [PLAYER_ID]
  );
  await connectDevice();
  await syncUsage();
});

afterEach(async () => {
  await database.close();
});

describe("first Blessing Offering migration", () => {
  it("consumes every Eligible Token, persists one Blessing, starts cooldown, and atomically allocates every point", async () => {
    const offering = await createOffering();
    expect(offering).toMatchObject({
      offered_tokens: "30",
      claude_code_tokens: "10",
      codex_tokens: "20",
      awarded_points: 2,
      replayed: false
    });
    expect(
      new Date(offering.cooldown_ends_at).getTime() -
        new Date(offering.created_at).getTime()
    ).toBe(12 * 60 * 60 * 1000);

    let state = await getTempleState();
    expect(state).toMatchObject({
      eligible_tokens: "0",
      total_tokens_offered: "30",
      claude_code_tokens_offered: "10",
      codex_tokens_offered: "20",
      offering_count: 1,
      rank_eligible: true,
      pending_offering_id: offering.offering_id,
      pending_points: 2,
      can_offer: false,
      offer_block_reason: "pending-allocation"
    });

    await becomeService();
    const allocation = await database.query(
      `select * from public.submit_blessing_allocation(
        $1, 'github-1', $2, $3::jsonb
      )`,
      [
        PLAYER_ID,
        offering.offering_id,
        JSON.stringify({ courage: 1, strength: 0, wisdom: 1, faith: 0 })
      ]
    );
    expect(allocation.rows).toMatchObject([
      {
        courage: 3,
        strength: 2,
        wisdom: 3,
        faith: 2,
        replayed: false
      }
    ]);

    state = await getTempleState();
    expect(state).toMatchObject({
      courage: 3,
      strength: 2,
      wisdom: 3,
      faith: 2,
      pending_offering_id: null,
      pending_points: 0,
      can_offer: false,
      offer_block_reason: "cooldown"
    });
  });

  it("returns the original result for the same idempotency key without consuming or generating twice", async () => {
    const first = await createOffering();
    const replay = await createOffering();

    expect(replay).toEqual({ ...first, replayed: true });
    const state = await getTempleState();
    expect(state).toMatchObject({
      eligible_tokens: "0",
      total_tokens_offered: "30",
      offering_count: 1,
      pending_offering_id: first.offering_id
    });
  });

  it("serializes a different concurrent attempt behind the pending Blessing", async () => {
    const first = await createOffering();

    await expect(
      createOffering("4beb4c83-cf17-4563-b915-2fd107f9c5d0")
    ).rejects.toThrow("OFFERING_PENDING_ALLOCATION");
    expect(await getTempleState()).toMatchObject({
      total_tokens_offered: "30",
      offering_count: 1,
      pending_offering_id: first.offering_id
    });
  });

  it("rolls back every mutation when the Blessing configuration is invalid", async () => {
    await becomeService();
    await expect(
      database.query(
        `select * from public.create_blessing_offering(
          $1, 'github-1', $2, 0.5, $3::jsonb
        )`,
        [
          PLAYER_ID,
          OFFERING_KEY,
          JSON.stringify([
            { points: 1, weight: 1 },
            { points: 2, weight: 1 }
          ])
        ]
      )
    ).rejects.toThrow("OFFERING_CONFIGURATION_INVALID");

    expect(await getTempleState()).toMatchObject({
      eligible_tokens: "30",
      total_tokens_offered: "0",
      offering_count: 0,
      cooldown_ends_at: null,
      pending_points: 0,
      can_offer: true
    });
  });

  it("requires every point in one allocation and makes a completed allocation replay-safe", async () => {
    const offering = await createOffering();

    await expect(
      allocate(offering.offering_id, {
        courage: 1,
        strength: 0,
        wisdom: 0,
        faith: 0
      })
    ).rejects.toThrow("BLESSING_ALLOCATION_INVALID");
    expect(await getTempleState()).toMatchObject({
      courage: 2,
      pending_points: 2
    });

    const completed = await allocate(offering.offering_id, {
      courage: 2,
      strength: 0,
      wisdom: 0,
      faith: 0
    });
    expect(completed).toMatchObject({ courage: 4, replayed: false });

    const replay = await allocate(offering.offering_id, {
      courage: 0,
      strength: 2,
      wisdom: 0,
      faith: 0
    });
    expect(replay).toMatchObject({
      courage: 4,
      strength: 2,
      replayed: true
    });
  });

  it("keeps cooldown running during allocation and updates attained-at only for changed attributes", async () => {
    const before = await getTempleState();
    const offering = await createOffering();
    const pending = await getTempleState();

    await allocate(offering.offering_id, {
      courage: 0,
      strength: 2,
      wisdom: 0,
      faith: 0
    });
    const completed = await getTempleState();

    expect(completed.cooldown_ends_at).toEqual(pending.cooldown_ends_at);
    expect(completed.courage_attained_at).toEqual(before.courage_attained_at);
    expect(
      new Date(String(completed.strength_attained_at)).getTime()
    ).toBeGreaterThanOrEqual(
      new Date(String(before.strength_attained_at)).getTime()
    );
  });

  it.each([
    [0, 1],
    [0.2499, 1],
    [0.25, 2],
    [0.7499, 2],
    [0.75, 3],
    [0.9999, 3]
  ])(
    "maps deterministic non-production random value %s to %s Blessing points",
    async (randomValue, expectedPoints) => {
      await expect(
        createOffering(OFFERING_KEY, randomValue)
      ).resolves.toMatchObject({ awarded_points: expectedPoints });
    }
  );

  it("keeps settlement, Offering records, and hidden inputs outside the browser role", async () => {
    await becomePlayer();
    await expect(
      database.query(
        `select * from public.create_blessing_offering(
          $1, 'github-1', $2, 0.5, $3::jsonb
        )`,
        [PLAYER_ID, OFFERING_KEY, JSON.stringify([
          { points: 1, weight: 1 },
          { points: 2, weight: 2 },
          { points: 3, weight: 1 }
        ])]
      )
    ).rejects.toThrow(/permission denied/i);
    await expect(
      database.query(`select * from private.offerings`)
    ).rejects.toThrow(/permission denied/i);
  });

  it("does not let a late replay consume Token growth that arrived after the original result", async () => {
    const first = await createOffering();
    await allocate(first.offering_id, {
      courage: 2,
      strength: 0,
      wisdom: 0,
      faith: 0
    });
    await syncUsage(10, 25);

    await expect(createOffering()).resolves.toMatchObject({
      offering_id: first.offering_id,
      offered_tokens: "30",
      replayed: true
    });
    expect(await getTempleState()).toMatchObject({
      eligible_tokens: "5",
      total_tokens_offered: "30",
      offering_count: 1
    });
  });
});

async function createOffering(
  idempotencyKey = OFFERING_KEY,
  randomValue = 0.5
) {
  await becomeService();
  const result = await database.query<{
    offering_id: string;
    offered_tokens: string;
    claude_code_tokens: string;
    codex_tokens: string;
    awarded_points: number;
    created_at: string;
    cooldown_ends_at: string;
    replayed: boolean;
  }>(
    `select * from public.create_blessing_offering(
      $1, 'github-1', $2, $3, $4::jsonb
    )`,
    [
      PLAYER_ID,
      idempotencyKey,
      randomValue,
      JSON.stringify([
        { points: 1, weight: 1 },
        { points: 2, weight: 2 },
        { points: 3, weight: 1 }
      ])
    ]
  );
  return result.rows[0]!;
}

async function getTempleState() {
  await becomePlayer();
  const result = await database.query<Record<string, unknown>>(
    `select * from public.get_my_temple_state()`
  );
  return result.rows[0]!;
}

async function allocate(
  offeringId: string,
  allocation: {
    courage: number;
    strength: number;
    wisdom: number;
    faith: number;
  }
) {
  await becomeService();
  const result = await database.query<{
    courage: number;
    strength: number;
    wisdom: number;
    faith: number;
    replayed: boolean;
  }>(
    `select * from public.submit_blessing_allocation(
      $1, 'github-1', $2, $3::jsonb
    )`,
    [PLAYER_ID, offeringId, JSON.stringify(allocation)]
  );
  return result.rows[0]!;
}

async function connectDevice() {
  await becomePlayer();
  await database.query(
    `select * from public.create_my_collector_device_code($1)`,
    ["1".repeat(43)]
  );
  await becomeService();
  await database.query(
    `select * from public.exchange_collector_device_code($1, 'selector-1', $2)`,
    ["1".repeat(43), "a".repeat(43)]
  );
  await database.query(
    `select * from public.activate_current_collector_device('selector-1', $1)`,
    ["a".repeat(43)]
  );
}

async function syncUsage(claudeTokens = 10, codexTokens = 20) {
  await becomeService();
  await database.query(
    `select * from public.sync_collector_usage_summaries(
      'selector-1', $1, '1.0.0', $2::jsonb
    )`,
    [
      "a".repeat(43),
      JSON.stringify([
        summary("claude-code", "c".repeat(43), claudeTokens),
        summary("codex", "d".repeat(43), codexTokens)
      ])
    ]
  );
}

function summary(agent: "claude-code" | "codex", summaryKey: string, tokens: number) {
  return {
    summaryKey,
    agent,
    utcHour: `${new Date().toISOString().slice(0, 13)}:00Z`,
    inputTokens: tokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    collectorVersion: "1.0.0",
    sourceLogFormatVersion: `${agent}-v1`
  };
}

async function becomePlayer() {
  await database.exec(`reset role`);
  await database.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
    PLAYER_ID
  ]);
  await database.exec(`set role authenticated`);
}

async function becomeService() {
  await database.exec(`reset role`);
  await database.exec(`set role service_role`);
}
