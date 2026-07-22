import type { UsageAgent } from "@tetraforce/contracts";

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type UsageEvent = TokenCounts & {
  timestamp: number;
};

export type AgentScan = {
  agent: UsageAgent;
  detected: boolean;
  events: UsageEvent[];
  sourceLogFormatVersion: string;
};

export function emptyCounts(): TokenCounts {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0
  };
}

export function sumCounts(counts: TokenCounts) {
  return (
    counts.inputTokens +
    counts.outputTokens +
    counts.cacheReadTokens +
    counts.cacheWriteTokens
  );
}

export function subtractCounts(
  current: TokenCounts,
  previous: TokenCounts
): TokenCounts | null {
  const delta: TokenCounts = {
    inputTokens: current.inputTokens - previous.inputTokens,
    outputTokens: current.outputTokens - previous.outputTokens,
    cacheReadTokens: current.cacheReadTokens - previous.cacheReadTokens,
    cacheWriteTokens: current.cacheWriteTokens - previous.cacheWriteTokens
  };
  return Object.values(delta).some((token) => token < 0) ? null : delta;
}

export function readToken(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function readTimestamp(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
