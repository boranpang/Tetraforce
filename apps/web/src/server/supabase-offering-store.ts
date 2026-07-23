import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BlessingAllocationResult,
  BlessingOfferingResult
} from "@tetraforce/contracts";

import {
  BlessingAllocationNotFoundError,
  InvalidBlessingAllocationError,
  InvalidOfferingConfigurationError,
  OfferingCollectorRequiredError,
  OfferingCooldownError,
  OfferingPendingAllocationError,
  OfferingTokensRequiredError,
  type OfferingStore
} from "./offering-service";

type OfferingRow = {
  offering_id: string;
  offered_tokens: string;
  claude_code_tokens: string;
  codex_tokens: string;
  awarded_points: number;
  created_at: string;
  cooldown_ends_at: string;
  replayed: boolean;
};

type AllocationRow = {
  courage: number;
  strength: number;
  wisdom: number;
  faith: number;
  replayed: boolean;
};

export class SupabaseOfferingStore implements OfferingStore {
  constructor(private readonly serviceClient: SupabaseClient | null) {}

  async create(
    input: Parameters<OfferingStore["create"]>[0]
  ): Promise<BlessingOfferingResult> {
    if (!this.serviceClient) {
      throw new Error("Offering settlement is not configured.");
    }
    const { data, error } = await this.serviceClient.rpc(
      "create_blessing_offering",
      {
        p_auth_user_id: input.authUserId,
        p_provider_user_id: input.providerUserId,
        p_idempotency_key: input.idempotencyKey,
        p_random_value: input.randomValue,
        p_point_weights: input.pointWeights
      }
    );
    if (error) {
      throw mapOfferingError(error.message);
    }
    const row = (data as OfferingRow[] | null)?.[0];
    if (!row) {
      throw new Error("Offering settlement returned no result.");
    }
    return {
      offeringId: row.offering_id,
      resultType: "blessing",
      offeredTokens: row.offered_tokens,
      agentTokens: {
        claudeCode: row.claude_code_tokens,
        codex: row.codex_tokens
      },
      awardedPoints: row.awarded_points,
      createdAt: new Date(row.created_at).toISOString(),
      cooldownEndsAt: new Date(row.cooldown_ends_at).toISOString(),
      replayed: row.replayed
    };
  }

  async allocate(
    input: Parameters<OfferingStore["allocate"]>[0]
  ): Promise<BlessingAllocationResult> {
    if (!this.serviceClient) {
      throw new Error("Blessing allocation is not configured.");
    }
    const { data, error } = await this.serviceClient.rpc(
      "submit_blessing_allocation",
      {
        p_auth_user_id: input.authUserId,
        p_provider_user_id: input.providerUserId,
        p_offering_id: input.offeringId,
        p_allocation: input.allocation
      }
    );
    if (error) {
      throw mapOfferingError(error.message);
    }
    const row = (data as AllocationRow[] | null)?.[0];
    if (!row) {
      throw new Error("Blessing allocation returned no result.");
    }
    return {
      attributes: {
        courage: row.courage,
        strength: row.strength,
        wisdom: row.wisdom,
        faith: row.faith
      },
      replayed: row.replayed
    };
  }
}

function mapOfferingError(message: string): Error {
  if (message.includes("OFFERING_PENDING_ALLOCATION")) {
    return new OfferingPendingAllocationError();
  }
  if (message.includes("OFFERING_COOLDOWN")) {
    return new OfferingCooldownError();
  }
  if (message.includes("OFFERING_COLLECTOR_REQUIRED")) {
    return new OfferingCollectorRequiredError();
  }
  if (message.includes("OFFERING_TOKENS_REQUIRED")) {
    return new OfferingTokensRequiredError();
  }
  if (message.includes("OFFERING_CONFIGURATION_INVALID")) {
    return new InvalidOfferingConfigurationError();
  }
  if (message.includes("BLESSING_ALLOCATION_INVALID")) {
    return new InvalidBlessingAllocationError();
  }
  if (message.includes("BLESSING_ALLOCATION_NOT_FOUND")) {
    return new BlessingAllocationNotFoundError();
  }
  return new Error("Offering settlement failed.");
}
