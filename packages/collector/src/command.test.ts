import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { USAGE_SUMMARY_FIELDS, type UsageSummary } from "@tetraforce/contracts";
import { runCli } from "./command";
import { DeviceApiError } from "./device-api";

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

describe("init command", () => {
  it("previews exact data before confirmation, exchanges only the code, and stores the credential privately", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-init-`);
    temporaryDirectories.push(stateDirectory);
    const credential =
      `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"s".repeat(43)}`;
    const calls: unknown[] = [];
    const prompts: string[] = [];
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["init"], {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux",
      roots: {
        claudeCode: `${fixtures}/claude-code/projects`,
        codex: `${fixtures}/codex/sessions`
      },
      stateDirectory,
      apiBaseUrl: "https://service.example",
      deviceApi: {
        activateDeviceCredential: async () => "activated" as const,
        revokeDeviceCredential: async () => "revoked" as const,
        exchangeDeviceCode: async (deviceCode) => {
          calls.push({ deviceCode });
          return {
            deviceCredential: credential,
            earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
          };
        }
      },
      prompt: {
        confirm: async (message) => {
          prompts.push(message);
          return true;
        },
        readDeviceCode: async (message) => {
          prompts.push(message);
          return "2345-6789-ABCD";
        }
      },
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: (text) => { stderr += text; } }
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Usage Summaries ready: 5");
    expect(readPendingJson(stdout)).toHaveLength(5);
    expect(prompts).toEqual([
      expect.stringContaining("Authorize this device"),
      expect.stringContaining("one-time Device Code")
    ]);
    expect(calls).toEqual([{ deviceCode: "2345-6789-ABCD" }]);

    const credentialFile = `${stateDirectory}/device-credential.json`;
    const stored = JSON.parse(await readFile(credentialFile, "utf8")) as {
      deviceCredential: string;
      earliestAcceptedUtcHour: string;
    };
    expect(stored).toMatchObject({
      deviceCredential: credential,
      earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
    });
    expect((await stat(credentialFile)).mode & 0o777).toBe(0o600);
    expect((await stat(stateDirectory)).mode & 0o777).toBe(0o700);
    expect(stdout).not.toContain(credential);
    expect(stdout).not.toContain("2345-6789-ABCD");
  });

  it("does not contact the service or create a credential when authorization is declined", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-decline-`);
    temporaryDirectories.push(stateDirectory);
    let apiCalls = 0;
    let stdout = "";

    const exitCode = await runCli(["init"], {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux",
      roots: {
        claudeCode: `${fixtures}/claude-code/projects`,
        codex: `${fixtures}/codex/sessions`
      },
      stateDirectory,
      apiBaseUrl: "https://service.example",
      deviceApi: {
        activateDeviceCredential: async () => "activated" as const,
        revokeDeviceCredential: async () => "revoked" as const,
        exchangeDeviceCode: async () => {
          apiCalls += 1;
          throw new Error("must not be called");
        }
      },
      prompt: {
        confirm: async () => false,
        readDeviceCode: async () => {
          throw new Error("must not be called");
        }
      },
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: () => undefined }
    });

    expect(exitCode).toBe(0);
    expect(apiCalls).toBe(0);
    expect(stdout).toContain("No device was connected");
    await expect(
      readFile(`${stateDirectory}/device-credential.json`, "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("connects with no logs or Token without sending an empty summary payload", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-empty-init-`);
    temporaryDirectories.push(stateDirectory);
    const exchangeInputs: unknown[] = [];
    let stdout = "";

    const exitCode = await runCli(["init"], {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux",
      roots: {
        claudeCode: `${stateDirectory}/missing-claude`,
        codex: `${stateDirectory}/missing-codex`
      },
      stateDirectory,
      apiBaseUrl: "https://service.example",
      deviceApi: {
        activateDeviceCredential: async () => "activated" as const,
        revokeDeviceCredential: async () => "revoked" as const,
        exchangeDeviceCode: async (deviceCode) => {
          exchangeInputs.push({ deviceCode });
          return {
            deviceCredential:
              `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"t".repeat(43)}`,
            earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
          };
        }
      },
      prompt: {
        confirm: async () => true,
        readDeviceCode: async () => "CDEF-GHJK-MNPQ"
      },
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: () => undefined }
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Detected Agents: None");
    expect(stdout).toContain("Usage Summaries ready: 0");
    expect(readPendingJson(stdout)).toEqual([]);
    expect(exchangeInputs).toEqual([{ deviceCode: "CDEF-GHJK-MNPQ" }]);
  });

  it("refuses a symbolic-link credential path before exchanging a code", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-symlink-`);
    temporaryDirectories.push(stateDirectory);
    const target = `${stateDirectory}/do-not-overwrite`;
    await writeFile(target, "sentinel\n", { mode: 0o600 });
    await symlink(target, `${stateDirectory}/device-credential.json`);
    let apiCalls = 0;
    let stderr = "";

    const exitCode = await runCli(["init"], {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux",
      roots: {
        claudeCode: `${stateDirectory}/missing-claude`,
        codex: `${stateDirectory}/missing-codex`
      },
      stateDirectory,
      apiBaseUrl: "https://service.example",
      deviceApi: {
        activateDeviceCredential: async () => "activated" as const,
        revokeDeviceCredential: async () => "revoked" as const,
        exchangeDeviceCode: async () => {
          apiCalls += 1;
          throw new Error("must not be called");
        }
      },
      prompt: {
        confirm: async () => true,
        readDeviceCode: async () => "CDEF-GHJK-MNPQ"
      },
      stdout: { write: () => undefined },
      stderr: { write: (text) => { stderr += text; } }
    });

    expect(exitCode).toBe(1);
    expect(apiCalls).toBe(0);
    expect(await readFile(target, "utf8")).toBe("sentinel\n");
    expect(stderr).not.toContain(target);
  });

  it.each([
    ["invalid-code", "invalid, expired, or already used", "Create a new code"],
    ["limit", "five active devices", "npx tetraforce unlink"]
  ] as const)(
    "gives safe recovery guidance for %s exchange failures",
    async (reason, expected, recovery) => {
      const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-error-`);
      temporaryDirectories.push(stateDirectory);
      let stderr = "";

      const exitCode = await runCli(["init"], {
        now: new Date("2026-07-22T10:30:00.000Z"),
        platform: "linux",
        roots: {
          claudeCode: `${stateDirectory}/missing-claude`,
          codex: `${stateDirectory}/missing-codex`
        },
        stateDirectory,
        apiBaseUrl: "https://service.example",
        deviceApi: {
          activateDeviceCredential: async () => "activated" as const,
          revokeDeviceCredential: async () => "revoked" as const,
          exchangeDeviceCode: async () => {
            throw new DeviceApiError(reason);
          }
        },
        prompt: {
          confirm: async () => true,
          readDeviceCode: async () => "CDEF-GHJK-MNPQ"
        },
        stdout: { write: () => undefined },
        stderr: { write: (text) => { stderr += text; } }
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain(expected);
      expect(stderr).toContain(recovery);
      expect(stderr).not.toContain("CDEF-GHJK-MNPQ");
    }
  );

  it("keeps the server-issued earliest UTC hour fixed when init is run again", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-reinit-`);
    temporaryDirectories.push(stateDirectory);
    let apiCalls = 0;
    let activations = 0;
    let confirmations = 0;
    const options = {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux" as const,
      roots: {
        claudeCode: `${stateDirectory}/missing-claude`,
        codex: `${stateDirectory}/missing-codex`
      },
      stateDirectory,
      apiBaseUrl: "https://service.example",
      deviceApi: {
        activateDeviceCredential: async () => {
          activations += 1;
          return "activated" as const;
        },
        revokeDeviceCredential: async () => "revoked" as const,
        exchangeDeviceCode: async () => {
          apiCalls += 1;
          return {
            deviceCredential:
              `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"u".repeat(43)}`,
            earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
          };
        }
      },
      prompt: {
        confirm: async () => {
          confirmations += 1;
          return true;
        },
        readDeviceCode: async () => "CDEF-GHJK-MNPQ"
      },
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    };

    expect(await runCli(["init"], options)).toBe(0);
    const first = await readFile(
      `${stateDirectory}/device-credential.json`,
      "utf8"
    );
    expect(await runCli(["init"], options)).toBe(0);
    const second = await readFile(
      `${stateDirectory}/device-credential.json`,
      "utf8"
    );

    expect(apiCalls).toBe(1);
    expect(activations).toBe(2);
    expect(confirmations).toBe(1);
    expect(second).toBe(first);
    expect(JSON.parse(second)).toMatchObject({
      earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
    });
  });

  it("keeps a persisted pending credential and resumes activation without another exchange", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-resume-`);
    temporaryDirectories.push(stateDirectory);
    let exchanges = 0;
    let activations = 0;
    let confirmations = 0;
    const options = {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux" as const,
      roots: {
        claudeCode: `${stateDirectory}/missing-claude`,
        codex: `${stateDirectory}/missing-codex`
      },
      stateDirectory,
      apiBaseUrl: "https://service.example",
      deviceApi: {
        exchangeDeviceCode: async () => {
          exchanges += 1;
          return {
            deviceCredential:
              `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"v".repeat(43)}`,
            earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
          };
        },
        activateDeviceCredential: async () => {
          activations += 1;
          if (activations === 1) {
            throw new DeviceApiError("unavailable");
          }
          return "activated" as const;
        },
        revokeDeviceCredential: async () => "revoked" as const
      },
      prompt: {
        confirm: async () => {
          confirmations += 1;
          return true;
        },
        readDeviceCode: async () => "CDEF-GHJK-MNPQ"
      },
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    };

    expect(await runCli(["init"], options)).toBe(1);
    await expect(
      readFile(`${stateDirectory}/device-credential.json`, "utf8")
    ).resolves.toContain("tf_d1.");
    expect(await runCli(["init"], options)).toBe(0);
    expect(exchanges).toBe(1);
    expect(activations).toBe(2);
    expect(confirmations).toBe(1);
  });

  it("revokes the current device and removes local secrets after explicit unlink confirmation", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-unlink-`);
    temporaryDirectories.push(stateDirectory);
    const credential =
      `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"w".repeat(43)}`;
    const revoked: string[] = [];
    const deviceApi = {
      exchangeDeviceCode: async () => ({
        deviceCredential: credential,
        earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
      }),
      activateDeviceCredential: async () => "activated" as const,
      revokeDeviceCredential: async (value: string) => {
        revoked.push(value);
        return "revoked" as const;
      }
    };
    const prompt = {
      confirm: async () => true,
      readDeviceCode: async () => "CDEF-GHJK-MNPQ"
    };
    const output = { write: () => undefined };

    expect(
      await runCli(["init"], {
        now: new Date("2026-07-22T10:30:00.000Z"),
        platform: "linux",
        roots: {
          claudeCode: `${fixtures}/claude-code/projects`,
          codex: `${fixtures}/codex/sessions`
        },
        stateDirectory,
        apiBaseUrl: "https://service.example",
        deviceApi,
        prompt,
        stdout: output,
        stderr: output
      })
    ).toBe(0);
    expect(
      await runCli(["unlink"], {
        platform: "linux",
        stateDirectory,
        deviceApi,
        prompt,
        stdout: output,
        stderr: output
      })
    ).toBe(0);

    expect(revoked).toEqual([credential]);
    for (const file of ["device-credential.json", "device-scope-secret"]) {
      await expect(readFile(`${stateDirectory}/${file}`, "utf8")).rejects.toMatchObject({
        code: "ENOENT"
      });
    }
  });

  it("never activates before persistence and best-effort revokes a pending device when persistence fails", async () => {
    const stateDirectory = await mkdtemp(`${tmpdir()}/tetraforce-rollback-`);
    temporaryDirectories.push(stateDirectory);
    const credential =
      `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"x".repeat(43)}`;
    const revoked: string[] = [];

    const exitCode = await runCli(["init"], {
      now: new Date("2026-07-22T10:30:00.000Z"),
      platform: "linux",
      roots: {
        claudeCode: `${stateDirectory}/missing-claude`,
        codex: `${stateDirectory}/missing-codex`
      },
      stateDirectory,
      apiBaseUrl: "https://service.example",
      credentialStore: {
        hasCredential: async () => false,
        load: async () => {
          throw new Error("must not be called");
        },
        save: async () => {
          throw new Error("disk full");
        },
        remove: async () => {
          throw new Error("must not be called");
        }
      },
      deviceApi: {
        exchangeDeviceCode: async () => ({
          deviceCredential: credential,
          earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
        }),
        activateDeviceCredential: async () => {
          throw new Error("must not be called");
        },
        revokeDeviceCredential: async (value) => {
          revoked.push(value);
          return "revoked";
        }
      },
      prompt: {
        confirm: async () => true,
        readDeviceCode: async () => "CDEF-GHJK-MNPQ"
      },
      stdout: { write: () => undefined },
      stderr: { write: () => undefined }
    });

    expect(exitCode).toBe(1);
    expect(revoked).toEqual([credential]);
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
