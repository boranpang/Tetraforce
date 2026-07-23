import { homedir } from "node:os";
import { join } from "node:path";

import {
  USAGE_SUMMARY_FIELDS,
  type UsageAgent
} from "@tetraforce/contracts";

import { createDeviceApi, DeviceApiError, type DeviceApi } from "./device-api";
import {
  createDeviceCredentialStore,
  type DeviceCredentialStore
} from "./device-credential-store";
import { createTerminalPrompt, type CollectorPrompt } from "./prompt";
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
  apiBaseUrl?: string;
  deviceApi?: DeviceApi;
  credentialStore?: DeviceCredentialStore;
  prompt?: CollectorPrompt;
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

  if (
    arguments_.length !== 1 ||
    !["show-data", "init", "unlink"].includes(arguments_[0] ?? "")
  ) {
    stderr.write("Usage: npx tetraforce <init|show-data|unlink>\n");
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
    const stateDirectory =
      options.stateDirectory ?? defaultStateDirectory(platform, homeDirectory);
    const credentialStore =
      options.credentialStore ?? createDeviceCredentialStore(stateDirectory);

    if (arguments_[0] === "unlink") {
      if (!(await credentialStore.hasCredential())) {
        stderr.write("This Collector is not connected.\n");
        return 1;
      }
      const connection = await credentialStore.load();
      const prompt = options.prompt ?? createTerminalPrompt();
      const confirmed = await prompt.confirm(
        "Revoke this device credential and remove its local Collector configuration?"
      );
      if (!confirmed) {
        stdout.write("\nUnlink cancelled. This device remains connected.\n");
        return 0;
      }
      const deviceApi =
        options.deviceApi ?? createDeviceApi(connection.apiBaseUrl);
      await deviceApi.revokeDeviceCredential(connection.deviceCredential);
      await credentialStore.remove();
      stdout.write(
        "\nCollector unlinked. Character progress and other devices were not changed.\n"
      );
      return 0;
    }

    const roots = options.roots ?? defaultRoots(homeDirectory);
    const summaryKeyFor =
      options.summaryKeyFor ?? createLocalSummaryKeyFactory(stateDirectory);
    const result = await collectUsage({
      now: options.now ?? new Date(),
      roots,
      summaryKeyFor
    });

    printUsagePreview(result, stdout);
    if (arguments_[0] === "show-data") {
      return 0;
    }

    if (await credentialStore.hasCredential()) {
      const existing = await credentialStore.load();
      const existingApi =
        options.deviceApi ?? createDeviceApi(existing.apiBaseUrl);
      const activation = await existingApi.activateDeviceCredential(
        existing.deviceCredential
      );
      if (activation === "activated") {
        stdout.write(
          "\nCollector connection confirmed. No Usage Summaries were uploaded and no scheduled task was registered.\n"
        );
        return 0;
      }
      await credentialStore.remove();
    }

    const prompt = options.prompt ?? createTerminalPrompt();
    const confirmed = await prompt.confirm(
      "Authorize this device for future Usage Summary uploads? " +
      "This setup does not upload data or register a scheduled task."
    );
    if (!confirmed) {
      stdout.write(
        "\nSetup cancelled. No device was connected, no data was uploaded, and no task was registered.\n"
      );
      return 0;
    }

    const apiBaseUrl =
      options.apiBaseUrl ?? process.env.TETRAFORCE_API_URL?.trim();
    if (!apiBaseUrl) {
      stderr.write(
        "The Tetraforce service address is not configured. Set TETRAFORCE_API_URL and try again.\n"
      );
      return 1;
    }
    const deviceCode = await prompt.readDeviceCode(
      "Enter the one-time Device Code shown on the Tetraforce website"
    );
    const deviceApi = options.deviceApi ?? createDeviceApi(apiBaseUrl);
    const connection = await deviceApi.exchangeDeviceCode(deviceCode);
    try {
      await credentialStore.save({
        version: 1,
        apiBaseUrl,
        ...connection
      });
    } catch (storageError) {
      await deviceApi
        .revokeDeviceCredential(connection.deviceCredential)
        .catch(() => undefined);
      throw storageError;
    }
    const activation = await deviceApi.activateDeviceCredential(
      connection.deviceCredential
    );
    if (activation === "already-invalid") {
      await credentialStore.remove();
      throw new DeviceApiError("invalid-code");
    }
    stdout.write(
      "\nCollector connected. No Usage Summaries were uploaded and no scheduled task was registered.\n"
    );
    return 0;
  } catch (error) {
    if (error instanceof DeviceApiError) {
      stderr.write(deviceApiErrorMessage(error));
      return 1;
    }
    stderr.write(
      arguments_[0] === "show-data"
        ? "Tetraforce could not read local Agent usage. Check local log permissions and try again.\n"
        : "Tetraforce Collector setup could not be completed. Check local file permissions and service configuration, then try again.\n"
    );
    return 1;
  }
}

function printUsagePreview(
  result: Awaited<ReturnType<typeof collectUsage>>,
  stdout: TextWriter
) {
  const detected = result.detectedAgents.map((agent) => AGENT_NAMES[agent]).join(", ");
  stdout.write(`Detected Agents: ${detected || "None"}\n`);
  stdout.write(`Usage Summaries ready: ${result.summaries.length}\n`);
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
}

function deviceApiErrorMessage(error: DeviceApiError) {
  switch (error.reason) {
    case "invalid-code":
      return "The Device Code is invalid, expired, or already used. Create a new code on the website and try again.\n";
    case "limit":
      return "This Character already has five active devices. Run npx tetraforce unlink on one connected device, then create a new code and try again.\n";
    case "rate-limit":
      return "Too many device requests were made. Wait before trying again.\n";
    case "unavailable":
      return "Tetraforce could not connect this Collector. Check the service address and network, then try again.\n";
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
