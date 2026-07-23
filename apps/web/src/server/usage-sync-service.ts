import {
  assertUsageSyncRequest,
  isSupportedCollectorVersion,
  type UsageSummary,
  type UsageSyncResponse
} from "@tetraforce/contracts";

import {
  parseDeviceCredential,
  type DeviceSecretService
} from "./device-secrets";

export type UsageSyncStore = {
  sync(input: {
    credentialSelector: string;
    credentialDigest: string;
    collectorVersion: string;
    summaries: readonly UsageSummary[];
  }): Promise<UsageSyncResponse>;
};

export async function syncUsageSummaries(input: {
  credential: string;
  collectorVersion: string;
  summaries: unknown;
  secrets: DeviceSecretService;
  store: UsageSyncStore;
}) {
  if (!isSupportedCollectorVersion(input.collectorVersion)) {
    throw new CollectorUpgradeRequiredError();
  }
  try {
    assertUsageSyncRequest(input.summaries, input.collectorVersion);
  } catch (error) {
    throw new InvalidUsageSummariesError({ cause: error });
  }

  const credential = parseDeviceCredential(input.credential);
  if (!credential) {
    throw new InvalidSyncCredentialError();
  }
  return input.store.sync({
    credentialSelector: credential.selector,
    credentialDigest: input.secrets.digestCredential(credential.secret),
    collectorVersion: input.collectorVersion,
    summaries: input.summaries
  });
}

export class InvalidUsageSummariesError extends Error {
  constructor(options?: ErrorOptions) {
    super("Usage Summary payload is invalid.", options);
    this.name = "InvalidUsageSummariesError";
  }
}

export class InvalidSyncCredentialError extends Error {
  constructor() {
    super("Device credential is invalid.");
    this.name = "InvalidSyncCredentialError";
  }
}

export class CollectorUpgradeRequiredError extends Error {
  constructor() {
    super("Collector version is unsupported.");
    this.name = "CollectorUpgradeRequiredError";
  }
}

export class UsageCounterRollbackError extends Error {
  constructor() {
    super("Usage Summary counters moved backward.");
    this.name = "UsageCounterRollbackError";
  }
}

export class UsageWindowInvalidError extends Error {
  constructor() {
    super("Usage Summary hour is outside the device window.");
    this.name = "UsageWindowInvalidError";
  }
}
