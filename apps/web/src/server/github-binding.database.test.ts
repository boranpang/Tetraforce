import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PLAYER_ONE = "4d4ce723-003d-43b2-8123-b8dc351abe0a";
const PLAYER_TWO = "ca2db7a0-90f8-4641-9743-48f9265ec942";
const migrationUrl = new URL(
  "../../../../supabase/migrations/202607220001_github_character_binding.sql",
  import.meta.url
);

type BindingFunctionRow = {
  id: string;
  game_name: string;
  courage: number;
  strength: number;
  wisdom: number;
  faith: number;
  created: boolean;
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
  await database.exec(await readFile(migrationUrl, "utf8"));
  await database.query(
    `insert into auth.users (id) values ($1), ($2)`,
    [PLAYER_ONE, PLAYER_TWO]
  );
  await database.query(
    `insert into auth.identities (user_id, provider, provider_id)
     values ($1, 'github', 'github-1'), ($2, 'github', 'github-2')`,
    [PLAYER_ONE, PLAYER_TWO]
  );
});

afterEach(async () => {
  await database.close();
});

describe("GitHub Character binding migration", () => {
  it("creates Character, private identity, and both Consent records atomically", async () => {
    const created = await completeBinding({
      authUserId: PLAYER_ONE,
      providerUserId: "github-1",
      gameName: "Alice_12",
      normalizedGameName: "alice_12"
    });

    expect(created.rows).toMatchObject([
      {
        game_name: "Alice_12",
        courage: 5,
        strength: 1,
        wisdom: 1,
        faith: 1,
        created: true
      }
    ]);

    await becomePlayer(PLAYER_ONE);
    const character = await database.query(`select game_name from public.get_my_github_character()`);
    const identity = await database.query(
      `select provider, provider_user_id from private.character_identities`
    );
    const consent = await database.query(
      `select terms_version, privacy_version,
              terms_accepted_at = privacy_accepted_at as accepted_together
       from private.character_consents`
    );

    expect(character.rows).toEqual([{ game_name: "Alice_12" }]);
    expect(identity.rows).toEqual([{ provider: "github", provider_user_id: "github-1" }]);
    expect(consent.rows).toEqual([
      {
        terms_version: "2026-07-22",
        privacy_version: "2026-07-22",
        accepted_together: true
      }
    ]);
  });

  it("restores the existing server Character and ignores a second Guest state", async () => {
    const first = await completeBinding({
      authUserId: PLAYER_ONE,
      providerUserId: "github-1",
      gameName: "Alice_12",
      normalizedGameName: "alice_12"
    });
    const restored = await completeBinding({
      authUserId: PLAYER_ONE,
      providerUserId: "github-1",
      gameName: "OtherName",
      normalizedGameName: "othername",
      courage: 1,
      strength: 5
    });

    expect(restored.rows).toMatchObject([
      {
        id: first.rows[0]?.id,
        game_name: "Alice_12",
        courage: 5,
        strength: 1,
        created: false
      }
    ]);
    await resetRole();
    const count = await database.query<{ count: number }>(
      `select count(*)::integer as count from public.characters`
    );
    expect(count.rows).toEqual([{ count: 1 }]);
  });

  it("prevents another player from reading private or Character records", async () => {
    await completeBinding({
      authUserId: PLAYER_ONE,
      providerUserId: "github-1",
      gameName: "Alice_12",
      normalizedGameName: "alice_12"
    });

    await becomePlayer(PLAYER_TWO);
    expect(
      (await database.query(`select id from public.get_my_github_character()`)).rows
    ).toEqual([]);
    expect((await database.query(`select id from public.characters`)).rows).toEqual([]);
    expect(
      (await database.query(`select character_id from private.character_identities`)).rows
    ).toEqual([]);
    expect(
      (await database.query(`select character_id from private.character_consents`)).rows
    ).toEqual([]);
    await expect(
      database.exec(`update public.characters set game_name = 'Stolen'`)
    ).rejects.toThrow(/permission denied for table characters/);
  });

  it("rejects a provider ID that is not verified by Supabase Auth", async () => {
    await expect(
      completeBinding({
        authUserId: PLAYER_ONE,
        providerUserId: "forged-github-id",
        gameName: "Alice",
        normalizedGameName: "alice"
      })
    ).rejects.toThrow("Verified GitHub identity is required.");

    await resetRole();
    const count = await database.query<{ count: number }>(
      `select count(*)::integer as count from public.characters`
    );
    expect(count.rows).toEqual([{ count: 0 }]);
  });

  it("enforces a bounded NFKC Game Name at the database boundary", async () => {
    await expect(
      completeBinding({
        authUserId: PLAYER_ONE,
        providerUserId: "github-1",
        gameName: "Ａlice",
        normalizedGameName: "alice"
      })
    ).rejects.toThrow(/characters_game_name_nfkc/);

    await expect(
      completeBinding({
        authUserId: PLAYER_ONE,
        providerUserId: "github-1",
        gameName: "abcdefghijklmnopq",
        normalizedGameName: "abcdefghijklmnopq"
      })
    ).rejects.toThrow(/characters_game_name_length/);
  });

  it("limits one verified identity to ten binding attempts per fifteen minutes", async () => {
    await resetRole();
    await database.exec(`set role service_role`);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await database.query(
        `select public.consume_character_binding_attempt($1, $2)`,
        [PLAYER_ONE, "github-1"]
      );
    }

    await expect(
      database.query(
        `select public.consume_character_binding_attempt($1, $2)`,
        [PLAYER_ONE, "github-1"]
      )
    ).rejects.toThrow("Too many Character binding attempts.");
  });

  it("rolls back every new record when the normalized Game Name is already taken", async () => {
    await completeBinding({
      authUserId: PLAYER_ONE,
      providerUserId: "github-1",
      gameName: "Alice",
      normalizedGameName: "alice"
    });

    await expect(
      completeBinding({
        authUserId: PLAYER_TWO,
        providerUserId: "github-2",
        gameName: "ALICE",
        normalizedGameName: "alice"
      })
    ).rejects.toThrow(/characters_normalized_game_name_key/);

    await resetRole();
    const counts = await database.query(
      `select
         (select count(*)::integer from public.characters) as characters,
         (select count(*)::integer from private.character_identities) as identities,
         (select count(*)::integer from private.character_consents) as consents`
    );
    expect(counts.rows).toEqual([{ characters: 1, identities: 1, consents: 1 }]);
  });
});

async function completeBinding(input: {
  authUserId: string;
  providerUserId: string;
  gameName: string;
  normalizedGameName: string;
  courage?: number;
  strength?: number;
}) {
  await resetRole();
  await database.exec(`set role service_role`);
  try {
    return await database.query<BindingFunctionRow>(
      `select * from public.complete_github_character_binding(
        $1, $2, $3, $4, $5, $6, 1, 1, '2026-07-22', '2026-07-22'
      )`,
      [
        input.authUserId,
        input.providerUserId,
        input.gameName,
        input.normalizedGameName,
        input.courage ?? 5,
        input.strength ?? 1
      ]
    );
  } finally {
    await resetRole();
  }
}

async function becomePlayer(authUserId: string) {
  await resetRole();
  await database.exec(`set role authenticated`);
  await database.query(`select set_config('request.jwt.claim.sub', $1, false)`, [authUserId]);
}

async function resetRole() {
  await database.exec(`reset role`);
}
