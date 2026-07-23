import { describe, expect, it } from "vitest";

import { createDeviceSecretService } from "./device-secrets";
import {
  CollectorUpgradeRequiredError,
  InvalidUsageSummariesError,
  syncUsageSummaries,
  type UsageSyncStore
} from "./usage-sync-service";

const secrets = createDeviceSecretService("p".repeat(32));
const credential = secrets.generateCredential();

describe("Usage Summary sync service", () => {
  it.each(["1.4.0", "0.9.0"])(
    "accepts supported Collector version %s and forwards the exact allowlisted batch",
    async (collectorVersion) => {
      let received: unknown;
      const result = await syncUsageSummaries({
        collectorVersion,
        credential: credential.value,
        summaries: [summary({ collectorVersion })],
        secrets,
        store: createStore({
          sync: async (input) => {
            received = input;
            return {
              acceptedSummaries: 1,
              eligibleTokens: "15",
              lastSuccessfulSyncAt: "2026-07-23T04:00:00.000Z"
            };
          }
        })
      });

      expect(result.eligibleTokens).toBe("15");
      expect(received).toMatchObject({
        collectorVersion,
        summaries: [summary({ collectorVersion })]
      });
    }
  );

  it("rejects older majors before touching the database", async () => {
    let called = false;
    await expect(
      syncUsageSummaries({
        collectorVersion: "2.0.0",
        credential: credential.value,
        summaries: [summary({ collectorVersion: "2.0.0" })],
        secrets,
        store: createStore({
          sync: async () => {
            called = true;
            throw new Error("must not be called");
          }
        })
      })
    ).rejects.toBeInstanceOf(CollectorUpgradeRequiredError);
    expect(called).toBe(false);
  });

  it("rejects additional fields and mismatched Collector versions", async () => {
    await expect(
      syncUsageSummaries({
        collectorVersion: "1.0.0",
        credential: credential.value,
        summaries: [{ ...summary(), model: "private-model" }],
        secrets,
        store: createStore()
      })
    ).rejects.toBeInstanceOf(InvalidUsageSummariesError);
    await expect(
      syncUsageSummaries({
        collectorVersion: "1.0.0",
        credential: credential.value,
        summaries: [summary({ collectorVersion: "0.9.0" })],
        secrets,
        store: createStore()
      })
    ).rejects.toBeInstanceOf(InvalidUsageSummariesError);
  });
});

function createStore(overrides: Partial<UsageSyncStore> = {}): UsageSyncStore {
  return {
    sync: async () => ({
      acceptedSummaries: 1,
      eligibleTokens: "0",
      lastSuccessfulSyncAt: "2026-07-23T04:00:00.000Z"
    }),
    ...overrides
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    summaryKey: "s".repeat(43),
    agent: "codex",
    utcHour: "2026-07-23T04:00Z",
    inputTokens: 10,
    outputTokens: 3,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
    collectorVersion: "1.0.0",
    sourceLogFormatVersion: "codex-rollout-v1",
    ...overrides
  };
}
