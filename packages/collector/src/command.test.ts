import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { USAGE_SUMMARY_FIELDS, type UsageSummary } from "@tetraforce/contracts";
import { runCli } from "./command";

const fixtures = fileURLToPath(new URL("../test/fixtures", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("show-data command", () => {
  it("prints the complete pending JSON and stable privacy field explanations", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-show-data-`);
    temporaryDirectories.push(stateDirectory);

    const first = await invokeShowData(stateDirectory);
    const second = await invokeShowData(stateDirectory);

    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toContain("Detected Agents: Claude Code, Codex");
    expect(first.stdout).toContain("Pending upload JSON:");
    expect(first.stdout).toContain("Approved Usage Summary fields:");

    const firstJson = readPendingJson(first.stdout);
    const secondJson = readPendingJson(second.stdout);
    expect(firstJson).toEqual(secondJson);
    expect(firstJson).toHaveLength(5);
    expect(new Set(firstJson.map(({ summaryKey }) => summaryKey)).size).toBe(5);

    for (const field of USAGE_SUMMARY_FIELDS) {
      expect(first.stdout).toContain(`- ${field.key} — ${field.description.en}`);
    }

    for (const prohibited of ["SecretProject", "private-model", "private-session-id"] ) {
      expect(first.stdout).not.toContain(prohibited);
    }
  });

  it("succeeds when no Agent is detected", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-no-agent-`);
    temporaryDirectories.push(stateDirectory);
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["show-data"], {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux",
      roots: {
        claudeCode: `${stateDirectory}/missing-claude`,
        codex: `${stateDirectory}/missing-codex`
      },
      stateDirectory,
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: (text) => { stderr += text; } }
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Detected Agents: None");
    expect(stdout).toContain("No uploadable Usage Summaries were found");
    expect(readPendingJson(stdout)).toEqual([]);
  });

  it("succeeds when detected Agents have no Token usage", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-no-token-`);
    temporaryDirectories.push(stateDirectory);
    const claudeRoot = `${stateDirectory}/claude`;
    const codexRoot = `${stateDirectory}/codex`;
    await mkdir(claudeRoot, { recursive: true });
    await mkdir(codexRoot, { recursive: true });
    await writeFile(`${claudeRoot}/empty.jsonl`, '{"type":"system","content":"sanitized"}\n');
    await writeFile(`${codexRoot}/empty.jsonl`, '{"type":"session_meta"}\n');
    let stdout = "";

    const exitCode = await runCli(["show-data"], {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux",
      roots: { claudeCode: claudeRoot, codex: codexRoot },
      stateDirectory,
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: () => undefined }
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Detected Agents: Claude Code, Codex");
    expect(readPendingJson(stdout)).toEqual([]);
  });

  it("returns an actionable unsupported message on native Windows", async () => {
    let stderr = "";
    const exitCode = await runCli(["show-data"], {
      platform: "win32",
      stdout: { write: () => undefined },
      stderr: { write: (text) => { stderr += text; } }
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("does not support native Windows");
    expect(stderr).toContain("macOS or Linux");
    expect(stderr).toContain("Manual Token entry and log-file upload are not supported");
  });
});

async function invokeShowData(stateDirectory: string) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(["show-data"], {
    now: new Date("2026-07-22T10:30:00.000Z"),
    platform: "linux",
    roots: {
      claudeCode: `${fixtures}/claude-code/projects`,
      codex: `${fixtures}/codex/sessions`
    },
    stateDirectory,
    stdout: { write: (text) => { stdout += text; } },
    stderr: { write: (text) => { stderr += text; } }
  });
  return { exitCode, stdout, stderr };
}

function readPendingJson(output: string): UsageSummary[] {
  const json = output
    .split("Pending upload JSON:\n")[1]
    ?.split("\n\nApproved Usage Summary fields:")[0];
  if (!json) {
    throw new Error("Pending upload JSON was not found.");
  }
  return JSON.parse(json) as UsageSummary[];
}
