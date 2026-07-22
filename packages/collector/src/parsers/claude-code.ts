import { discoverJsonlFiles, readJsonLines } from "../jsonl";
import {
  asRecord,
  readTimestamp,
  readToken,
  type AgentScan,
  type TokenCounts,
  type UsageEvent
} from "../usage-event";

export async function scanClaudeCode(root: string): Promise<AgentScan> {
  const discovery = await discoverJsonlFiles(root);
  const events: UsageEvent[] = [];
  const seenMessages = new Set<string>();

  for (const file of discovery.files) {
    let lineNumber = 0;
    await readJsonLines(file, (record) => {
      lineNumber += 1;
      const event = readClaudeEvent(record);
      if (!event) {
        return;
      }

      const messageKey = readClaudeMessageKey(record) ?? `${file}:${lineNumber}`;
      if (seenMessages.has(messageKey)) {
        return;
      }
      seenMessages.add(messageKey);
      events.push(event);
    });
  }

  return {
    agent: "claude-code",
    detected: discovery.detected,
    events,
    sourceLogFormatVersion: "claude-code-jsonl-v1"
  };
}

function readClaudeEvent(value: unknown): UsageEvent | null {
  const record = asRecord(value);
  const message = asRecord(record?.message);
  const usage = asRecord(message?.usage);
  const timestamp = readTimestamp(record?.timestamp);
  if (record?.type !== "assistant" || !usage || timestamp === null) {
    return null;
  }

  const counts = readCounts({
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens
  });
  return counts ? { timestamp, ...counts } : null;
}

function readClaudeMessageKey(value: unknown): string | null {
  const record = asRecord(value);
  const message = asRecord(record?.message);
  const requestId = typeof record?.requestId === "string" ? record.requestId : "";
  const messageId = typeof message?.id === "string" ? message.id : "";
  return requestId || messageId ? `${requestId}:${messageId}` : null;
}

function readCounts(value: Record<keyof TokenCounts, unknown>): TokenCounts | null {
  const counts = Object.fromEntries(
    Object.entries(value).map(([key, token]) => [
      key,
      token === undefined ? 0 : readToken(token)
    ])
  ) as Record<keyof TokenCounts, number | null>;
  return Object.values(counts).some((token) => token === null)
    ? null
    : (counts as TokenCounts);
}
