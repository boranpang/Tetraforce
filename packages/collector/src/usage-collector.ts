import {
  assertUsageSummary,
  isUtcHour,
  type UsageAgent,
  type UsageSummary
} from "@tetraforce/contracts";

import { scanClaudeCode } from "./parsers/claude-code";
import { scanCodex } from "./parsers/codex";
import {
  emptyCounts,
  sumCounts,
  type TokenCounts
} from "./usage-event";
import { COLLECTOR_VERSION } from "./version";

const HOUR_MILLISECONDS = 60 * 60 * 1000;

export type UsageRoots = {
  claudeCode: string;
  codex: string;
};

export type SummaryKeyFactory = (
  agent: UsageAgent,
  utcHour: string
) => Promise<string> | string;

export type CollectUsageOptions = {
  now: Date;
  earliestAcceptedUtcHour?: string;
  roots: UsageRoots;
  summaryKeyFor: SummaryKeyFactory;
};

export type CollectedUsage = {
  detectedAgents: UsageAgent[];
  summaries: UsageSummary[];
};

export async function collectUsage(options: CollectUsageOptions): Promise<CollectedUsage> {
  const now = options.now.getTime();
  if (Number.isNaN(now)) {
    throw new Error("Collector clock is invalid.");
  }

  const currentHour = floorToUtcHour(now);
  const windowStart = options.earliestAcceptedUtcHour
    ? parseHistoryBoundary(options.earliestAcceptedUtcHour, currentHour)
    : currentHour - 23 * HOUR_MILLISECONDS;
  const scans = await Promise.all([
    scanClaudeCode(options.roots.claudeCode),
    scanCodex(options.roots.codex)
  ]);
  const summaries: UsageSummary[] = [];

  for (const scan of scans) {
    const buckets = new Map<string, TokenCounts>();
    for (const event of scan.events) {
      if (event.timestamp < windowStart || event.timestamp > now) {
        continue;
      }

      const utcHour = formatUtcHour(event.timestamp);
      const bucket = buckets.get(utcHour) ?? emptyCounts();
      addCounts(bucket, event);
      buckets.set(utcHour, bucket);
    }

    for (const [utcHour, counts] of buckets) {
      if (sumCounts(counts) === 0) {
        continue;
      }

      const summary: UsageSummary = {
        summaryKey: await options.summaryKeyFor(scan.agent, utcHour),
        agent: scan.agent,
        utcHour,
        ...counts,
        collectorVersion: COLLECTOR_VERSION,
        sourceLogFormatVersion: scan.sourceLogFormatVersion
      };
      assertUsageSummary(summary);
      summaries.push(summary);
    }
  }

  summaries.sort(
    (left, right) =>
      left.utcHour.localeCompare(right.utcHour) || left.agent.localeCompare(right.agent)
  );

  return {
    detectedAgents: scans.filter(({ detected }) => detected).map(({ agent }) => agent),
    summaries
  };
}

function parseHistoryBoundary(value: string, currentHour: number) {
  if (!isUtcHour(value)) {
    throw new Error("Collector device history boundary is invalid.");
  }
  const boundary = Date.parse(value);
  if (boundary > currentHour) {
    throw new Error("Collector device history boundary is in the future.");
  }
  return boundary;
}

function addCounts(target: TokenCounts, addition: TokenCounts) {
  for (const key of Object.keys(target) as (keyof TokenCounts)[]) {
    const total = target[key] + addition[key];
    if (!Number.isSafeInteger(total)) {
      throw new Error("Usage Summary Token count exceeds the safe integer range.");
    }
    target[key] = total;
  }
}

function floorToUtcHour(timestamp: number) {
  return Math.floor(timestamp / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
}

function formatUtcHour(timestamp: number) {
  return `${new Date(floorToUtcHour(timestamp)).toISOString().slice(0, 13)}:00Z`;
}
