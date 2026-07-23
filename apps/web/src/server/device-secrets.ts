import { createHmac, randomBytes } from "node:crypto";

import { formatDeviceCode, normalizeDeviceCode } from "@tetraforce/contracts";

const DEVICE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CREDENTIAL_PATTERN =
  /^tf_d1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export type DeviceSecretService = {
  generateCode(): string;
  digestCode(deviceCode: string): string;
  generateCredential(): {
    value: string;
    selector: string;
    digest: string;
  };
  digestCredential(secret: string): string;
  digestRequestKey(
    operation: "exchange" | "activate" | "revoke",
    requestKey: string
  ): string;
};

export function createDeviceSecretService(pepper: string): DeviceSecretService {
  if (pepper.length < 32) {
    throw new Error("Collector device secret pepper must contain at least 32 characters.");
  }

  return {
    generateCode() {
      const bytes = randomBytes(12);
      const normalized = Array.from(
        bytes,
        (byte) => DEVICE_CODE_ALPHABET[byte & 31]
      ).join("");
      return formatDeviceCode(normalized);
    },
    digestCode(deviceCode) {
      const normalized = normalizeDeviceCode(deviceCode);
      if (!normalized) {
        throw new Error("Device Code is invalid.");
      }
      return digest(pepper, "collector-device-code-v1", normalized);
    },
    generateCredential() {
      const selector = randomBytes(16).toString("base64url");
      const secret = randomBytes(32).toString("base64url");
      return {
        value: `tf_d1.${selector}.${secret}`,
        selector,
        digest: digest(pepper, "collector-device-credential-v1", secret)
      };
    },
    digestCredential(secret) {
      return digest(pepper, "collector-device-credential-v1", secret);
    },
    digestRequestKey(operation, requestKey) {
      return digest(
        pepper,
        `collector-device-${operation}-request-v1`,
        requestKey
      );
    }
  };
}

export function parseDeviceCredential(
  value: string
): { selector: string; secret: string } | null {
  const match = CREDENTIAL_PATTERN.exec(value);
  return match ? { selector: match[1]!, secret: match[2]! } : null;
}

export function getDeviceSecretService(): DeviceSecretService | null {
  const pepper = process.env.TETRAFORCE_DEVICE_SECRET_PEPPER;
  return pepper && pepper.length >= 32
    ? createDeviceSecretService(pepper)
    : null;
}

function digest(pepper: string, domain: string, value: string): string {
  return createHmac("sha256", pepper)
    .update(`${domain}\0${value}`)
    .digest("base64url");
}
