import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BindingStore,
  CompleteBindingInput,
  PersistentCharacter
} from "./binding-service";

type CharacterRow = {
  id: string;
  game_name: string;
  courage: number;
  strength: number;
  wisdom: number;
  faith: number;
};

export class SupabaseBindingStore implements BindingStore {
  constructor(
    private readonly sessionClient: SupabaseClient,
    private readonly serviceClient: SupabaseClient | null
  ) {}

  async findByIdentity(): Promise<PersistentCharacter | null> {
    const { data, error } = await this.sessionClient.rpc("get_my_github_character");

    if (error) {
      throw new Error("Character binding state could not be loaded.", { cause: error });
    }

    const row = (data as CharacterRow[] | null)?.[0];
    return row ? toPersistentCharacter(row) : null;
  }

  async consumeBindingAttempt(input: { authUserId: string; providerUserId: string }) {
    if (!this.serviceClient) {
      throw new Error("Character binding is not configured.");
    }

    const { error } = await this.serviceClient.rpc("consume_character_binding_attempt", {
      p_auth_user_id: input.authUserId,
      p_provider_user_id: input.providerUserId
    });

    if (error) {
      if (error.message.includes("Too many Character binding attempts.")) {
        throw new BindingRateLimitError();
      }
      throw new Error("Character binding rate limit could not be checked.", { cause: error });
    }
  }

  async complete(input: CompleteBindingInput) {
    if (!this.serviceClient) {
      throw new Error("Character binding is not configured.");
    }

    const { data, error } = await this.serviceClient.rpc(
      "complete_github_character_binding",
      {
        p_auth_user_id: input.authUserId,
        p_provider_user_id: input.providerUserId,
        p_game_name: input.gameName,
        p_normalized_game_name: input.normalizedGameName,
        p_courage: input.attributes.courage,
        p_strength: input.attributes.strength,
        p_wisdom: input.attributes.wisdom,
        p_faith: input.attributes.faith,
        p_terms_version: input.termsVersion,
        p_privacy_version: input.privacyVersion
      }
    );

    if (error) {
      if (error.code === "23505") {
        const existingCharacter = await this.findByIdentity();
        if (existingCharacter) {
          return { character: existingCharacter, created: false };
        }
        throw new GameNameConflictError();
      }
      throw new Error("Character binding could not be completed.", { cause: error });
    }

    const row = (data as (CharacterRow & { created: boolean })[] | null)?.[0];
    if (!row) {
      throw new Error("Character binding returned no Character.");
    }

    return { character: toPersistentCharacter(row), created: row.created };
  }
}

export class GameNameConflictError extends Error {
  constructor() {
    super("Game Name is already taken.");
    this.name = "GameNameConflictError";
  }
}

export class BindingRateLimitError extends Error {
  constructor() {
    super("Too many Character binding attempts.");
    this.name = "BindingRateLimitError";
  }
}

function toPersistentCharacter(row: CharacterRow): PersistentCharacter {
  return {
    id: row.id,
    gameName: row.game_name,
    attributes: {
      courage: row.courage,
      strength: row.strength,
      wisdom: row.wisdom,
      faith: row.faith
    }
  };
}
