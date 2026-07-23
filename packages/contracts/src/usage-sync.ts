import {
  assertUsageSummary,
  type UsageSummary
} from "./usage-summary";

export const COLLECTOR_VERSION_HEADER = "x-tetraforce-cli-version";

export type UsageSyncRequest = UsageSummary[];

export type UsageSyncResponse = {
  acceptedSummaries: number;
  eligibleTokens: string;
  lastSuccessfulSyncAt: string;
};

export type UsageSyncErrorCode =
  | "USAGE_SUMMARIES_INVALID"
  | "USAGE_COUNTER_ROLLBACK"
  | "USAGE_WINDOW_INVALID"
  | "DEVICE_CREDENTIAL_INVALID"
  | "COLLECTOR_UPGRADE_REQUIRED"
  | "USAGE_SYNC_UNAVAILABLE";

export type UsageSyncErrorResponse = {
  code: UsageSyncErrorCode;
  error: string;
};

export const CURRENT_COLLECTOR_MAJOR = 1;

export function assertUsageSyncRequest(
  value: unknown,
  collectorVersion: string
): asserts value is UsageSyncRequest {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 500
  ) {
    throw new Error("Usage Summary batch must contain 1-500 items.");
  }
  for (const summary of value) {
    assertUsageSummary(summary);
    if (!/^[A-Za-z0-9_-]{43}$/.test(summary.summaryKey)) {
      throw new Error("Usage Summary key is invalid.");
    }
    if (summary.collectorVersion !== collectorVersion) {
      throw new Error("Usage Summary Collector version does not match.");
    }
    if (
      summary.sourceLogFormatVersion.length > 64 ||
      !/^[A-Za-z0-9._-]+$/.test(summary.sourceLogFormatVersion)
    ) {
      throw new Error("Usage Summary source-log format version is invalid.");
    }
    const total =
      summary.inputTokens +
      summary.outputTokens +
      summary.cacheReadTokens +
      summary.cacheWriteTokens;
    if (!Number.isSafeInteger(total)) {
      throw new Error("Usage Summary total exceeds the safe integer range.");
    }
  }
}

export function isSupportedCollectorVersion(value: string) {
  const match = /^(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) {
    return false;
  }
  const major = Number(match[1]);
  return major === CURRENT_COLLECTOR_MAJOR || major === CURRENT_COLLECTOR_MAJOR - 1;
}
