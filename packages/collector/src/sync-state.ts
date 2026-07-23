import { chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import type { UsageSummary } from "@tetraforce/contracts";

type SyncedCounts = Pick<
  UsageSummary,
  "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens"
>;

type StoredSyncState = {
  version: 1;
  summaries: Record<string, SyncedCounts>;
};

const FILE_NAME = "sync-state.json";
const COUNT_KEYS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens"
] as const;

export type SyncStateStore = {
  selectChanged(summaries: readonly UsageSummary[]): Promise<UsageSummary[]>;
  recordSuccess(summaries: readonly UsageSummary[]): Promise<void>;
};

export function createSyncStateStore(stateDirectory: string): SyncStateStore {
  const file = join(stateDirectory, FILE_NAME);

  return {
    async selectChanged(summaries) {
      const state = await load(file);
      return summaries.filter((summary) => {
        const previous = state.summaries[summary.summaryKey];
        if (!previous) {
          return true;
        }
        if (COUNT_KEYS.some((key) => summary[key] < previous[key])) {
          throw new Error("Local Usage Summary counters moved backward.");
        }
        return COUNT_KEYS.some((key) => summary[key] > previous[key]);
      });
    },
    async recordSuccess(summaries) {
      const state = await load(file);
      for (const summary of summaries) {
        state.summaries[summary.summaryKey] = Object.fromEntries(
          COUNT_KEYS.map((key) => [key, summary[key]])
        ) as SyncedCounts;
      }
      await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
      await chmod(stateDirectory, 0o700);
      const temporary = join(
        stateDirectory,
        `.${FILE_NAME}.${process.pid}.${randomBytes(8).toString("hex")}`
      );
      await writeFile(temporary, `${JSON.stringify(state)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
      await rename(temporary, file);
      await chmod(file, 0o600);
    }
  };
}

async function load(file: string): Promise<StoredSyncState> {
  try {
    const metadata = await lstat(file);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("Collector sync state path is unsafe.");
    }
    const value = JSON.parse(await readFile(file, "utf8")) as Partial<StoredSyncState>;
    if (value.version !== 1 || !isSummaryRecord(value.summaries)) {
      throw new Error("Collector sync state is invalid.");
    }
    return value as StoredSyncState;
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return { version: 1, summaries: {} };
    }
    throw error;
  }
}

function isSummaryRecord(value: unknown): value is Record<string, SyncedCounts> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, counts]) =>
      key.length > 0 &&
      counts !== null &&
      typeof counts === "object" &&
      COUNT_KEYS.every((countKey) => {
        const count = (counts as Record<string, unknown>)[countKey];
        return Number.isSafeInteger(count) && Number(count) >= 0;
      })
  );
}

function hasCode(error: unknown, code: string) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
