import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as allocate } from "../../app/api/v1/offerings/allocation/route";
import { POST as offer } from "../../app/api/v1/offerings/route";
import {
  OfferingCooldownError,
  OfferingPendingAllocationError,
  OfferingTokensRequiredError
} from "./offering-service";
import { SupabaseOfferingStore } from "./supabase-offering-store";

vi.mock("./supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase")>();
  return {
    ...actual,
    createSessionSupabaseClient: async () => ({
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "4d4ce723-003d-43b2-8123-b8dc351abe0a",
              identities: [{ provider: "github", id: "github-1" }]
            }
          }
        })
      }
    }),
    createServiceSupabaseClient: () => ({})
  };
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  process.env.SUPABASE_SECRET_KEY = "secret";
  process.env.TETRAFORCE_BLESSING_POINT_WEIGHTS = JSON.stringify([
    { points: 1, weight: 1 },
    { points: 2, weight: 2 },
    { points: 3, weight: 1 }
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.TETRAFORCE_BLESSING_POINT_WEIGHTS;
});

describe("Offering API", () => {
  it("creates a private idempotent Blessing response", async () => {
    vi.spyOn(SupabaseOfferingStore.prototype, "create").mockResolvedValue(
      offeringResult
    );

    const response = await offer(
      jsonRequest("https://service.example/api/v1/offerings", {
        idempotencyKey: "af0cad38-4ea5-40d7-81d7-e6beef58d1cb"
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual(offeringResult);
  });

  it("rejects a malformed idempotency key without reaching settlement", async () => {
    const settlement = vi.spyOn(SupabaseOfferingStore.prototype, "create");
    const response = await offer(
      jsonRequest("https://service.example/api/v1/offerings", {
        idempotencyKey: "invalid"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "OFFERING_REQUEST_INVALID"
    });
    expect(settlement).not.toHaveBeenCalled();
  });

  it("submits the complete allocation through a separate private endpoint", async () => {
    vi.spyOn(SupabaseOfferingStore.prototype, "allocate").mockResolvedValue({
      attributes: { courage: 3, strength: 2, wisdom: 3, faith: 2 },
      replayed: false
    });

    const response = await allocate(
      jsonRequest("https://service.example/api/v1/offerings/allocation", {
        offeringId: offeringResult.offeringId,
        allocation: { courage: 1, strength: 0, wisdom: 1, faith: 0 }
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      attributes: { courage: 3, strength: 2, wisdom: 3, faith: 2 }
    });
  });

  it.each([
    [
      new OfferingPendingAllocationError(),
      "OFFERING_PENDING_ALLOCATION"
    ],
    [new OfferingCooldownError(), "OFFERING_COOLDOWN"],
    [new OfferingTokensRequiredError(), "OFFERING_TOKENS_REQUIRED"]
  ] as const)(
    "returns a stable conflict for an authoritative database rejection",
    async (error, code) => {
      vi.spyOn(SupabaseOfferingStore.prototype, "create").mockRejectedValue(
        error
      );
      const response = await offer(
        jsonRequest("https://service.example/api/v1/offerings", {
          idempotencyKey: "af0cad38-4ea5-40d7-81d7-e6beef58d1cb"
        })
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ code });
    }
  );
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

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
