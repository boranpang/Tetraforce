import { constants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  unlink
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

import {
  isUtcHour,
  type DeviceCodeExchangeResponse
} from "@tetraforce/contracts";

const CREDENTIAL_FILE_NAME = "device-credential.json";
const DEVICE_SCOPE_SECRET_FILE_NAME = "device-scope-secret";
const SYNC_STATE_FILE_NAME = "sync-state.json";
const DEVICE_CREDENTIAL_PATTERN =
  /^tf_d1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;

export type StoredDeviceCredential = DeviceCodeExchangeResponse & {
  version: 1;
  apiBaseUrl: string;
};

export type DeviceCredentialStore = {
  hasCredential(): Promise<boolean>;
  load(): Promise<StoredDeviceCredential>;
  save(value: StoredDeviceCredential): Promise<void>;
  remove(): Promise<void>;
};

export function createDeviceCredentialStore(
  stateDirectory: string
): DeviceCredentialStore {
  const credentialFile = join(stateDirectory, CREDENTIAL_FILE_NAME);

  return {
    async hasCredential() {
      await secureStateDirectory(stateDirectory);
      try {
        const metadata = await lstat(credentialFile);
        if (metadata.isSymbolicLink() || !metadata.isFile()) {
          throw new Error("Collector credential path is unsafe.");
        }
        return true;
      } catch (error) {
        if (hasCode(error, "ENOENT")) {
          return false;
        }
        throw error;
      }
    },
    async load() {
      await secureStateDirectory(stateDirectory);
      const metadata = await lstat(credentialFile);
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new Error("Collector credential path is unsafe.");
      }
      const value = JSON.parse(
        await readFile(credentialFile, "utf8")
      ) as Partial<StoredDeviceCredential>;
      if (
        value.version !== 1 ||
        typeof value.apiBaseUrl !== "string" ||
        typeof value.deviceCredential !== "string" ||
        !DEVICE_CREDENTIAL_PATTERN.test(value.deviceCredential) ||
        typeof value.earliestAcceptedUtcHour !== "string" ||
        !isUtcHour(value.earliestAcceptedUtcHour)
      ) {
        throw new Error("Collector credential file is invalid.");
      }
      return value as StoredDeviceCredential;
    },
    async save(value) {
      await secureStateDirectory(stateDirectory);
      const temporaryFile = join(
        stateDirectory,
        `.${CREDENTIAL_FILE_NAME}.${process.pid}.${randomBytes(8).toString("hex")}`
      );
      let handle;
      try {
        handle = await open(
          temporaryFile,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600
        );
        await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
        await handle.chmod(0o600);
        await handle.sync();
        await handle.close();
        handle = undefined;
        await link(temporaryFile, credentialFile);
      } finally {
        await handle?.close();
        await unlink(temporaryFile).catch((error: unknown) => {
          if (!hasCode(error, "ENOENT")) {
            throw error;
          }
        });
      }
    },
    async remove() {
      await secureStateDirectory(stateDirectory);
      const metadata = await lstat(credentialFile);
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new Error("Collector credential path is unsafe.");
      }
      await unlink(credentialFile);
      await unlink(join(stateDirectory, DEVICE_SCOPE_SECRET_FILE_NAME)).catch(
        (error: unknown) => {
          if (!hasCode(error, "ENOENT")) {
            throw error;
          }
        }
      );
      await unlink(join(stateDirectory, SYNC_STATE_FILE_NAME)).catch(
        (error: unknown) => {
          if (!hasCode(error, "ENOENT")) {
            throw error;
          }
        }
      );
    }
  };
}

async function secureStateDirectory(stateDirectory: string) {
  try {
    const metadata = await lstat(stateDirectory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("Collector state directory is unsafe.");
    }
  } catch (error) {
    if (!hasCode(error, "ENOENT")) {
      throw error;
    }
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  }
  await chmod(stateDirectory, 0o700);
}

function hasCode(error: unknown, code: string) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
