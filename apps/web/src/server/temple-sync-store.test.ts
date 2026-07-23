import { describe, expect, it } from "vitest";

import { TempleSyncStore } from "./temple-sync-store";

describe("Temple state store", () => {
  it("maps the complete authoritative Offering state without exposing fate configuration", async () => {
    let rpcName: string | undefined;
    const store = new TempleSyncStore({
      rpc: async (name: string) => {
        rpcName = name;
        return {
          data: [
            {
              character_id: "94606318-e25f-4dee-ab13-ee58b1747aa0",
              game_name: "Alice",
              courage: 2,
              strength: 2,
              wisdom: 2,
              faith: 2,
              total_tokens_offered: "30",
              claude_code_tokens_offered: "10",
              codex_tokens_offered: "20",
              offering_count: 1,
              rank_eligible: true,
              total_tokens_attained_at: "2026-07-23T06:00:00.000Z",
              courage_attained_at: "2026-07-22T06:00:00.000Z",
              strength_attained_at: "2026-07-22T06:00:00.000Z",
              wisdom_attained_at: "2026-07-22T06:00:00.000Z",
              faith_attained_at: "2026-07-22T06:00:00.000Z",
              collector_connected: true,
              eligible_tokens: "0",
              last_successful_sync_at: "2026-07-23T05:55:00.000Z",
              collector_stale: false,
              server_now: "2026-07-23T06:00:00.000Z",
              cooldown_ends_at: "2026-07-23T18:00:00.000Z",
              pending_offering_id: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
              pending_offered_tokens: "30",
              pending_claude_code_tokens: "10",
              pending_codex_tokens: "20",
              pending_points: 2,
              pending_created_at: "2026-07-23T06:00:00.000Z",
              can_offer: false,
              offer_block_reason: "pending-allocation"
            }
          ],
          error: null
        };
      }
    } as never);

    await expect(store.get()).resolves.toMatchObject({
      character: {
        gameName: "Alice",
        attributes: { courage: 2, strength: 2, wisdom: 2, faith: 2 }
      },
      eligibleTokens: "0",
      pendingOffering: {
        resultType: "blessing",
        offeredTokens: "30",
        awardedPoints: 2
      },
      canOffer: false,
      offerBlockReason: "pending-allocation"
    });
    expect(rpcName).toBe("get_my_temple_state");
  });
});
