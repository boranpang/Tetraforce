import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/v1/usage-summaries/route";
import { createDeviceSecretService } from "./device-secrets";
import { SupabaseUsageSyncStore } from "./supabase-usage-sync-store";
import {
  UsageCounterRollbackError,
  UsageWindowInvalidError
} from "./usage-sync-service";

const secrets = createDeviceSecretService("p".repeat(32));
const credential = secrets.generateCredential().value;

beforeEach(() => {
  process.env.TETRAFORCE_DEVICE_SECRET_PEPPER = "p".repeat(32);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  process.env.SUPABASE_SECRET_KEY = "secret";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TETRAFORCE_DEVICE_SECRET_PEPPER;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
});

describe("POST /api/v1/usage-summaries", () => {
  it("returns a private success response for a valid current CLI request", async () => {
    vi.spyOn(SupabaseUsageSyncStore.prototype, "sync").mockResolvedValue({
      acceptedSummaries: 1,
      eligibleTokens: "15",
      lastSuccessfulSyncAt: "2026-07-23T04:00:00.000Z"
    });

    const response = await POST(request(summary()));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      acceptedSummaries: 1,
      eligibleTokens: "15"
    });
  });

  it.each([
    ["invalid credential", "", "1.0.0", summary(), 401, "DEVICE_CREDENTIAL_INVALID"],
    [
      "extra field",
      credential,
      "1.0.0",
      { ...summary(), model: "private-model" },
      400,
      "USAGE_SUMMARIES_INVALID"
    ],
    [
      "unsupported version",
      credential,
      "2.0.0",
      { ...summary(), collectorVersion: "2.0.0" },
      426,
      "COLLECTOR_UPGRADE_REQUIRED"
    ]
  ] as const)(
    "maps %s to the stable API error contract",
    async (_name, requestCredential, version, body, status, code) => {
      const response = await POST(
        request(body, requestCredential, version)
      );
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({ code });
    }
  );

  it.each([
    [new UsageCounterRollbackError(), 409, "USAGE_COUNTER_ROLLBACK"],
    [new UsageWindowInvalidError(), 400, "USAGE_WINDOW_INVALID"]
  ] as const)(
    "maps database validation failures without exposing internals",
    async (error, status, code) => {
      vi.spyOn(SupabaseUsageSyncStore.prototype, "sync").mockRejectedValue(error);
      const response = await POST(request(summary()));
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({ code });
    }
  );
});

function request(
  body: Record<string, unknown>,
  requestCredential = credential,
  version = "1.0.0"
) {
  return new Request("https://service.example/api/v1/usage-summaries", {
    method: "POST",
    headers: {
      authorization: requestCredential ? `Bearer ${requestCredential}` : "",
      "content-type": "application/json",
      "x-tetraforce-cli-version": version
    },
    body: JSON.stringify([body])
  });
}

function summary() {
  return {
    summaryKey: "s".repeat(43),
    agent: "codex",
    utcHour: "2026-07-23T04:00Z",
    inputTokens: 10,
    outputTokens: 3,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
    collectorVersion: "1.0.0",
    sourceLogFormatVersion: "codex-rollout-v1"
  };
}
