import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { UsageSummary } from "@tetraforce/contracts";
import { runCli } from "./command";
import { createDeviceCredentialStore } from "./device-credential-store";

const fixtures = fileURLToPath(new URL("../test/fixtures", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("manual sync command", () => {
  it("uploads cumulative summaries once and sends no request when nothing changed", async () => {
    const stateDirectory = await connectedState();
    const uploaded: UsageSummary[][] = [];
    const options = {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux" as const,
      roots: {
        claudeCode: `${fixtures}/claude-code/projects`,
        codex: `${fixtures}/codex/sessions`
      },
      stateDirectory,
      deviceApi: {
        exchangeDeviceCode: async () => {
          throw new Error("must not exchange");
        },
        activateDeviceCredential: async () => "activated" as const,
        revokeDeviceCredential: async () => "revoked" as const,
        syncUsageSummaries: async (
          _credential: string,
          summaries: readonly UsageSummary[]
        ) => {
          uploaded.push([...summaries]);
          return {
            acceptedSummaries: summaries.length,
            eligibleTokens: "1725",
            lastSuccessfulSyncAt: "2026-07-22T10:30:00.000Z"
          };
        }
      },
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    };

    expect(await runCli(["sync"], options)).toBe(0);
    expect(await runCli(["sync"], options)).toBe(0);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toHaveLength(5);
  });

  it("requires a connected Collector before manual sync", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-sync-empty-`);
    temporaryDirectories.push(stateDirectory);
    let stderr = "";

    const exitCode = await runCli(["sync"], {
      platform: "linux",
      stateDirectory,
      roots: {
        claudeCode: `${stateDirectory}/missing`,
        codex: `${stateDirectory}/missing`
      },
      stdout: { write: () => undefined },
      stderr: { write: (text) => { stderr += text; } }
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("npx tetraforce init");
  });
});

async function connectedState() {
  const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-sync-`);
  temporaryDirectories.push(stateDirectory);
  await createDeviceCredentialStore(stateDirectory).save({
    version: 1,
    apiBaseUrl: "https://service.example",
    deviceCredential: `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"s".repeat(43)}`,
    earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
  });
  return stateDirectory;
}
