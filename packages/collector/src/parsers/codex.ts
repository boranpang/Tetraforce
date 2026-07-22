import { discoverJsonlFiles, readJsonLines } from "../jsonl";
import {
  asRecord,
  emptyCounts,
  readTimestamp,
  readToken,
  subtractCounts,
  sumCounts,
  type AgentScan,
  type TokenCounts,
  type UsageEvent
} from "../usage-event";

export async function scanCodex(root: string): Promise<AgentScan> {
  const discovery = await discoverJsonlFiles(root);
  const events: UsageEvent[] = [];

  for (const file of discovery.files) {
    let previous = emptyCounts();
    await readJsonLines(file, (record) => {
      const cumulative = readCodexCumulativeEvent(record);
      if (!cumulative) {
        return;
      }

      const delta = subtractCounts(cumulative.counts, previous);
      previous = cumulative.counts;
      if (delta && sumCounts(delta) > 0) {
        events.push({ timestamp: cumulative.timestamp, ...delta });
      }
    });
  }

  return {
    agent: "codex",
    detected: discovery.detected,
    events,
    sourceLogFormatVersion: "codex-rollout-v1"
  };
}

function readCodexCumulativeEvent(value: unknown): {
  timestamp: number;
  counts: TokenCounts;
} | null {
  const record = asRecord(value);
  const payload = asRecord(record?.payload);
  const info = asRecord(payload?.info);
  const usage = asRecord(info?.total_token_usage);
  const timestamp = readTimestamp(record?.timestamp);
  if (
    record?.type !== "event_msg" ||
    payload?.type !== "token_count" ||
    !usage ||
    timestamp === null
  ) {
    return null;
  }

  const input = readToken(usage.input_tokens);
  const cached = readToken(usage.cached_input_tokens);
  const output = readToken(usage.output_tokens);
  if (input === null || cached === null || output === null || cached > input) {
    return null;
  }

  return {
    timestamp,
    counts: {
      inputTokens: input - cached,
      outputTokens: output,
      cacheReadTokens: cached,
      cacheWriteTokens: 0
    }
  };
}
