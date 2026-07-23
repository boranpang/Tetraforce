import { describe, expect, it } from "vitest";

import type { OfferingConfig } from "./offering-config";
import {
  createBlessingOffering,
  submitBlessingAllocation,
  type OfferingStore
} from "./offering-service";

const authUser = {
  id: "4d4ce723-003d-43b2-8123-b8dc351abe0a",
  identities: [{ provider: "github", providerId: "github-1" }]
};
const config: OfferingConfig = {
  blessingPointWeights: [
    { points: 1, weight: 1 },
    { points: 2, weight: 2 },
    { points: 3, weight: 1 }
  ]
};

describe("Blessing Offering service", () => {
  it("uses the verified identity, injected configuration, and deterministic random source", async () => {
    let received: unknown;
    const store = createStore({
      create: async (input) => {
        received = input;
        return offeringResult;
      }
    });

    await expect(
      createBlessingOffering({
        authUser,
        idempotencyKey: "af0cad38-4ea5-40d7-81d7-e6beef58d1cb",
        config,
        random: { next: () => 0.5 },
        store
      })
    ).resolves.toEqual(offeringResult);
    expect(received).toEqual({
      authUserId: authUser.id,
      providerUserId: "github-1",
      idempotencyKey: "af0cad38-4ea5-40d7-81d7-e6beef58d1cb",
      randomValue: 0.5,
      pointWeights: config.blessingPointWeights
    });
  });

  it("rejects invalid request identifiers and incomplete allocations before the database", async () => {
    const store = createStore({
      create: async () => {
        throw new Error("create must not run");
      },
      allocate: async () => {
        throw new Error("allocate must not run");
      }
    });

    await expect(
      createBlessingOffering({
        authUser,
        idempotencyKey: "not-a-uuid",
        config,
        random: { next: () => 0.5 },
        store
      })
    ).rejects.toThrow("Offering request is invalid.");

    await expect(
      submitBlessingAllocation({
        authUser,
        offeringId: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
        allocation: { courage: -1, strength: 0, wisdom: 0, faith: 0 },
        store
      })
    ).rejects.toThrow("Blessing allocation is invalid.");
  });
});

const offeringResult = {
  offeringId: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
  resultType: "blessing" as const,
  offeredTokens: "30",
  agentTokens: { claudeCode: "10", codex: "20" },
  awardedPoints: 2,
  createdAt: "2026-07-23T06:00:00.000Z",
  cooldownEndsAt: "2026-07-23T18:00:00.000Z",
  replayed: false
};

function createStore(overrides: Partial<OfferingStore> = {}): OfferingStore {
  return {
    create: async () => offeringResult,
    allocate: async () => ({
      attributes: { courage: 3, strength: 2, wisdom: 3, faith: 2 },
      replayed: false
    }),
    ...overrides
  };
}
