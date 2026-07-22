import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { UsageAgent } from "@tetraforce/contracts";

import type { SummaryKeyFactory } from "./usage-collector";

const SECRET_FILE_NAME = "device-scope-secret";
const SECRET_PATTERN = /^[a-f0-9]{64}$/;

export function createLocalSummaryKeyFactory(stateDirectory: string): SummaryKeyFactory {
  let secretPromise: Promise<string> | undefined;

  return async (agent: UsageAgent, utcHour: string) => {
    secretPromise ??= readOrCreateSecret(stateDirectory);
    const secret = await secretPromise;
    return createHmac("sha256", secret)
      .update(`usage-summary-v1\0${agent}\0${utcHour}`)
      .digest("base64url");
  };
}

async function readOrCreateSecret(stateDirectory: string): Promise<string> {
  const secretFile = join(stateDirectory, SECRET_FILE_NAME);

  try {
    return validateSecret(await readFile(secretFile, "utf8"));
  } catch (error) {
    if (!hasCode(error, "ENOENT")) {
      throw error;
    }
  }

  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  const generated = randomBytes(32).toString("hex");
  try {
    await writeFile(secretFile, `${generated}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
    return generated;
  } catch (error) {
    if (hasCode(error, "EEXIST")) {
      return validateSecret(await readFile(secretFile, "utf8"));
    }
    throw error;
  }
}

function validateSecret(value: string) {
  const secret = value.trim();
  if (!SECRET_PATTERN.test(secret)) {
    throw new Error("The local Collector device scope is invalid.");
  }
  return secret;
}

function hasCode(error: unknown, code: string) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
