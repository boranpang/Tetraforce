import {
  normalizeDeviceCode,
  type DeviceCodeExchangeResponse,
  type DeviceCodeResponse
} from "@tetraforce/contracts";

import {
  parseDeviceCredential,
  type DeviceSecretService
} from "./device-secrets";

export type DeviceCredentialProof = {
  credentialSelector: string;
  credentialDigest: string;
};

export type DeviceRequestOperation = "exchange" | "activate" | "revoke";

export type DeviceBindingStore = {
  consumeRequestAttempt(input: {
    operation: DeviceRequestOperation;
    requestKeyDigest: string;
  }): Promise<void>;
  createCode(input: { codeDigest: string }): Promise<{ expiresAt: string }>;
  exchangeCode(input: DeviceCredentialProof & {
    codeDigest: string;
  }): Promise<{ earliestAcceptedUtcHour: string }>;
  activateCurrentDevice(input: DeviceCredentialProof): Promise<boolean>;
  revokeCurrentDevice(input: DeviceCredentialProof): Promise<boolean>;
};

export async function issueDeviceCode(
  store: DeviceBindingStore,
  secrets: DeviceSecretService
): Promise<DeviceCodeResponse> {
  const deviceCode = secrets.generateCode();
  const { expiresAt } = await store.createCode({
    codeDigest: secrets.digestCode(deviceCode)
  });
  return { deviceCode, expiresAt };
}

export async function exchangeDeviceCode(
  deviceCode: string,
  store: DeviceBindingStore,
  secrets: DeviceSecretService,
  requestKey: string
): Promise<DeviceCodeExchangeResponse> {
  await store.consumeRequestAttempt({
    operation: "exchange",
    requestKeyDigest: secrets.digestRequestKey("exchange", requestKey)
  });
  const normalized = normalizeDeviceCode(deviceCode);
  if (!normalized) {
    throw new InvalidDeviceCodeError();
  }

  const credential = secrets.generateCredential();
  const result = await store.exchangeCode({
    codeDigest: secrets.digestCode(normalized),
    credentialSelector: credential.selector,
    credentialDigest: credential.digest
  });
  return {
    deviceCredential: credential.value,
    earliestAcceptedUtcHour: result.earliestAcceptedUtcHour
  };
}

export async function revokeDeviceCredential(
  value: string,
  store: DeviceBindingStore,
  secrets: DeviceSecretService,
  requestKey: string
): Promise<boolean> {
  await store.consumeRequestAttempt({
    operation: "revoke",
    requestKeyDigest: secrets.digestRequestKey("revoke", requestKey)
  });
  const credential = parseDeviceCredential(value);
  if (!credential) {
    return false;
  }
  return store.revokeCurrentDevice({
    credentialSelector: credential.selector,
    credentialDigest: secrets.digestCredential(credential.secret)
  });
}

export async function activateDeviceCredential(
  value: string,
  store: DeviceBindingStore,
  secrets: DeviceSecretService,
  requestKey: string
): Promise<boolean> {
  await store.consumeRequestAttempt({
    operation: "activate",
    requestKeyDigest: secrets.digestRequestKey("activate", requestKey)
  });
  const credential = parseDeviceCredential(value);
  if (!credential) {
    return false;
  }
  return store.activateCurrentDevice({
    credentialSelector: credential.selector,
    credentialDigest: secrets.digestCredential(credential.secret)
  });
}

export class InvalidDeviceCodeError extends Error {
  constructor() {
    super("Device code is invalid or expired.");
    this.name = "InvalidDeviceCodeError";
  }
}

export class DeviceLimitReachedError extends Error {
  constructor() {
    super("A Character can have at most five active devices.");
    this.name = "DeviceLimitReachedError";
  }
}

export class DeviceCodeRateLimitError extends Error {
  constructor() {
    super("Too many Device Code creation attempts.");
    this.name = "DeviceCodeRateLimitError";
  }
}

export class DeviceRequestRateLimitError extends Error {
  constructor() {
    super("Too many Collector device requests.");
    this.name = "DeviceRequestRateLimitError";
  }
}
