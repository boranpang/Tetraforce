import { appendFile, cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { USAGE_SUMMARY_KEYS } from "@tetraforce/contracts";
import { collectUsage } from "./index";

const fixtures = fileURLToPath(new URL("../test/fixtures", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("Collector Usage Summary", () => {
  it("discovers Claude Code and Codex together without leaking fixture content", async () => {
    const result = await collectUsage({
      now: new Date("2026-07-22T10:30:00.000Z"),
      roots: {
        claudeCode: `${fixtures}/claude-code/projects`,
        codex: `${fixtures}/codex/sessions`
      },
      summaryKeyFor: async (agent, utcHour) => `key:${agent}:${utcHour}`
    });

    expect(result).toEqual({
      detectedAgents: ["claude-code", "codex"],
      summaries: [
        {
          summaryKey: "key:codex:2026-07-22T08:00Z",
          agent: "codex",
          utcHour: "2026-07-22T08:00Z",
          inputTokens: 500,
          outputTokens: 50,
          cacheReadTokens: 100,
          cacheWriteTokens: 0,
          collectorVersion: "1.0.0",
          sourceLogFormatVersion: "codex-rollout-v1"
        },
        {
          summaryKey: "key:claude-code:2026-07-22T09:00Z",
          agent: "claude-code",
          utcHour: "2026-07-22T09:00Z",
          inputTokens: 120,
          outputTokens: 30,
          cacheReadTokens: 40,
          cacheWriteTokens: 10,
          collectorVersion: "1.0.0",
          sourceLogFormatVersion: "claude-code-jsonl-v1"
        },
        {
          summaryKey: "key:codex:2026-07-22T09:00Z",
          agent: "codex",
          utcHour: "2026-07-22T09:00Z",
          inputTokens: 300,
          outputTokens: 50,
          cacheReadTokens: 100,
          cacheWriteTokens: 0,
          collectorVersion: "1.0.0",
          sourceLogFormatVersion: "codex-rollout-v1"
        },
        {
          summaryKey: "key:claude-code:2026-07-22T10:00Z",
          agent: "claude-code",
          utcHour: "2026-07-22T10:00Z",
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 2,
          cacheWriteTokens: 3,
          collectorVersion: "1.0.0",
          sourceLogFormatVersion: "claude-code-jsonl-v1"
        },
        {
          summaryKey: "key:codex:2026-07-22T10:00Z",
          agent: "codex",
          utcHour: "2026-07-22T10:00Z",
          inputTokens: 400,
          outputTokens: 60,
          cacheReadTokens: 100,
          cacheWriteTokens: 0,
          collectorVersion: "1.0.0",
          sourceLogFormatVersion: "codex-rollout-v1"
        }
      ]
    });

    for (const summary of result.summaries) {
      expect(Object.keys(summary)).toEqual(USAGE_SUMMARY_KEYS);
    }

    const serialized = JSON.stringify(result);
    for (const prohibited of [
      "SecretProject",
      "private-model",
      "private-session-id",
      "secret prompt",
      "secret response",
      "secret command",
      "/Users/private"
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("keeps prior buckets stable while the current UTC hour grows", async () => {
    const temporaryRoot = await mkdtemp(`${tmpdir()}/tetraforce-growth-`);
    temporaryDirectories.push(temporaryRoot);
    await cp(`${fixtures}/claude-code`, `${temporaryRoot}/claude-code`, {
      recursive: true
    });
    await mkdir(`${temporaryRoot}/codex/sessions`, { recursive: true });

    const options = {
      now: new Date("2026-07-22T10:30:00.000Z"),
      roots: {
        claudeCode: `${temporaryRoot}/claude-code/projects`,
        codex: `${temporaryRoot}/codex/sessions`
      },
      summaryKeyFor: async (agent: "claude-code" | "codex", utcHour: string) =>
        `key:${agent}:${utcHour}`
    };
    const before = await collectUsage(options);

    await appendFile(
      `${temporaryRoot}/claude-code/projects/sanitized/session.jsonl`,
      '\n{"timestamp":"2026-07-22T10:20:00.000Z","type":"assistant","requestId":"request-3","message":{"id":"message-3","usage":{"input_tokens":7,"output_tokens":4,"cache_read_input_tokens":1,"cache_creation_input_tokens":2}}}\n'
    );
    const after = await collectUsage(options);

    expect(before.summaries.find(({ utcHour }) => utcHour === "2026-07-22T09:00Z"))
      .toEqual(after.summaries.find(({ utcHour }) => utcHour === "2026-07-22T09:00Z"));
    expect(after.summaries.find(({ utcHour }) => utcHour === "2026-07-22T10:00Z"))
      .toMatchObject({
        inputTokens: 17,
        outputTokens: 9,
        cacheReadTokens: 3,
        cacheWriteTokens: 5
      });
  });

  it("includes exactly the current UTC hour and previous 23 hour buckets", async () => {
    const temporaryRoot = await mkdtemp(`${tmpdir()}/tetraforce-window-`);
    temporaryDirectories.push(temporaryRoot);
    const claudeRoot = `${temporaryRoot}/claude/projects/sample`;
    await mkdir(claudeRoot, { recursive: true });
    await writeFile(
      `${claudeRoot}/window.jsonl`,
      [
        claudeLine("2026-07-21T10:59:59.999Z", "before", 100),
        claudeLine("2026-07-21T11:00:00.000Z", "boundary", 11),
        claudeLine("2026-07-22T10:30:00.001Z", "future", 100)
      ].join("\n")
    );

    const result = await collectUsage({
      now: new Date("2026-07-22T10:30:00.000Z"),
      roots: { claudeCode: `${temporaryRoot}/claude/projects`, codex: `${temporaryRoot}/missing` },
      summaryKeyFor: async () => "boundary-key"
    });

    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toMatchObject({
      utcHour: "2026-07-21T11:00Z",
      inputTokens: 11
    });
  });

  it("uses the connected device history boundary instead of a rolling 24-hour window", async () => {
    const temporaryRoot = await mkdtemp(`${tmpdir()}/tetraforce-device-window-`);
    temporaryDirectories.push(temporaryRoot);
    const claudeRoot = `${temporaryRoot}/claude/projects/sample`;
    await mkdir(claudeRoot, { recursive: true });
    await writeFile(
      `${claudeRoot}/history.jsonl`,
      [
        claudeLine("2026-07-20T10:00:00.000Z", "before-device", 100),
        claudeLine("2026-07-20T11:00:00.000Z", "device-boundary", 25)
      ].join("\n")
    );

    const result = await collectUsage({
      now: new Date("2026-07-22T10:30:00.000Z"),
      earliestAcceptedUtcHour: "2026-07-20T11:00:00.000Z",
      roots: {
        claudeCode: `${temporaryRoot}/claude/projects`,
        codex: `${temporaryRoot}/missing`
      },
      summaryKeyFor: async () => "device-boundary-key"
    });

    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toMatchObject({
      utcHour: "2026-07-20T11:00Z",
      inputTokens: 25
    });
  });
});

function claudeLine(timestamp: string, id: string, inputTokens: number) {
  return JSON.stringify({
    timestamp,
    type: "assistant",
    requestId: id,
    message: {
      id,
      usage: {
        input_tokens: inputTokens,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0
      }
    }
  });
}
