import { homedir } from "node:os";
import { join } from "node:path";

import {
  USAGE_SUMMARY_FIELDS,
  type UsageAgent
} from "@tetraforce/contracts";

import { createLocalSummaryKeyFactory } from "./summary-key";
import {
  collectUsage,
  type SummaryKeyFactory,
  type UsageRoots
} from "./usage-collector";

type TextWriter = {
  write(text: string): unknown;
};

export type RunCliOptions = {
  now?: Date;
  platform?: NodeJS.Platform;
  roots?: UsageRoots;
  stateDirectory?: string;
  summaryKeyFor?: SummaryKeyFactory;
  stdout?: TextWriter;
  stderr?: TextWriter;
};

const AGENT_NAMES: Record<UsageAgent, string> = {
  "claude-code": "Claude Code",
  codex: "Codex"
};

export async function runCli(
  arguments_: readonly string[],
  options: RunCliOptions = {}
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (arguments_.length !== 1 || arguments_[0] !== "show-data") {
    stderr.write("Usage: npx tetraforce show-data\n");
    return 2;
  }

  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    stderr.write(
      "Tetraforce Collector does not support native Windows. " +
      "Run this command on macOS or Linux. Manual Token entry and log-file upload are not supported.\n"
    );
    return 1;
  }

  if (platform !== "darwin" && platform !== "linux") {
    stderr.write("Tetraforce Collector supports macOS and Linux only.\n");
    return 1;
  }

  try {
    const homeDirectory = homedir();
    const roots = options.roots ?? defaultRoots(homeDirectory);
    const stateDirectory =
      options.stateDirectory ?? defaultStateDirectory(platform, homeDirectory);
    const summaryKeyFor =
      options.summaryKeyFor ?? createLocalSummaryKeyFactory(stateDirectory);
    const result = await collectUsage({
      now: options.now ?? new Date(),
      roots,
      summaryKeyFor
    });

    const detected = result.detectedAgents.map((agent) => AGENT_NAMES[agent]).join(", ");
    stdout.write(`Detected Agents: ${detected || "None"}\n`);
    if (result.summaries.length === 0) {
      stdout.write(
        "No uploadable Usage Summaries were found in the current UTC hour or previous 23 hours.\n"
      );
    }
    stdout.write(`\nPending upload JSON:\n${JSON.stringify(result.summaries, null, 2)}\n`);
    stdout.write("\nApproved Usage Summary fields:\n");
    for (const field of USAGE_SUMMARY_FIELDS) {
      stdout.write(`- ${field.key} — ${field.description.en}\n`);
    }
    return 0;
  } catch {
    stderr.write(
      "Tetraforce could not read local Agent usage. Check local log permissions and try again.\n"
    );
    return 1;
  }
}

function defaultRoots(homeDirectory: string): UsageRoots {
  return {
    claudeCode: join(homeDirectory, ".claude", "projects"),
    codex: join(homeDirectory, ".codex", "sessions")
  };
}

function defaultStateDirectory(platform: NodeJS.Platform, homeDirectory: string) {
  if (platform === "darwin") {
    return join(homeDirectory, "Library", "Application Support", "Tetraforce");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homeDirectory, ".config"), "tetraforce");
}
