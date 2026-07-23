import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfferingBlockReason,
  TempleState
} from "@tetraforce/contracts";

export type TempleSyncState = TempleState;

type TempleStateRow = {
  character_id: string;
  game_name: string;
  courage: number;
  strength: number;
  wisdom: number;
  faith: number;
  total_tokens_offered: string;
  claude_code_tokens_offered: string;
  codex_tokens_offered: string;
  offering_count: number;
  rank_eligible: boolean;
  total_tokens_attained_at: string | null;
  courage_attained_at: string;
  strength_attained_at: string;
  wisdom_attained_at: string;
  faith_attained_at: string;
  collector_connected: boolean;
  eligible_tokens: string;
  last_successful_sync_at: string | null;
  collector_stale: boolean;
  server_now: string;
  cooldown_ends_at: string | null;
  pending_offering_id: string | null;
  pending_offered_tokens: string | null;
  pending_claude_code_tokens: string | null;
  pending_codex_tokens: string | null;
  pending_points: number;
  pending_created_at: string | null;
  can_offer: boolean;
  offer_block_reason: OfferingBlockReason | null;
};

export class TempleSyncStore {
  constructor(private readonly sessionClient: SupabaseClient) {}

  async get(): Promise<TempleState | null> {
    const { data, error } = await this.sessionClient.rpc(
      "get_my_temple_state"
    );
    if (error) {
      throw new Error("Temple state could not be loaded.", { cause: error });
    }
    const row = (data as TempleStateRow[] | null)?.[0];
    if (!row) {
      return null;
    }
    return {
      character: {
        id: row.character_id,
        gameName: row.game_name,
        attributes: {
          courage: row.courage,
          strength: row.strength,
          wisdom: row.wisdom,
          faith: row.faith
        }
      },
      aggregates: {
        totalTokensOffered: row.total_tokens_offered,
        agentTokensOffered: {
          claudeCode: row.claude_code_tokens_offered,
          codex: row.codex_tokens_offered
        },
        offeringCount: row.offering_count,
        rankEligible: row.rank_eligible,
        attainedAt: {
          totalTokens: toIso(row.total_tokens_attained_at),
          courage: toIso(row.courage_attained_at)!,
          strength: toIso(row.strength_attained_at)!,
          wisdom: toIso(row.wisdom_attained_at)!,
          faith: toIso(row.faith_attained_at)!
        }
      },
      collector: {
        connected: row.collector_connected,
        lastSuccessfulSyncAt: toIso(row.last_successful_sync_at),
        stale: row.collector_stale
      },
      eligibleTokens: row.eligible_tokens,
      serverNow: toIso(row.server_now)!,
      cooldownEndsAt: toIso(row.cooldown_ends_at),
      pendingOffering:
        row.pending_offering_id &&
        row.pending_offered_tokens &&
        row.pending_claude_code_tokens &&
        row.pending_codex_tokens &&
        row.pending_created_at
          ? {
              offeringId: row.pending_offering_id,
              resultType: "blessing",
              offeredTokens: row.pending_offered_tokens,
              agentTokens: {
                claudeCode: row.pending_claude_code_tokens,
                codex: row.pending_codex_tokens
              },
              awardedPoints: row.pending_points,
              createdAt: toIso(row.pending_created_at)!,
              cooldownEndsAt: toIso(row.cooldown_ends_at)!,
              replayed: true
            }
          : null,
      canOffer: row.can_offer,
      offerBlockReason: row.offer_block_reason
    };
  }
}

function toIso(value: string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
