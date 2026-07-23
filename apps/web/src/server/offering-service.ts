import { randomBytes } from "node:crypto";

import {
  ATTRIBUTE_KEYS,
  type BlessingAllocationResult,
  type BlessingOfferingResult,
  type Attributes
} from "@tetraforce/contracts";

import type { VerifiedAuthUser } from "./binding-service";
import type {
  BlessingPointWeight,
  OfferingConfig
} from "./offering-config";

export type OfferingStore = {
  create(input: {
    authUserId: string;
    providerUserId: string;
    idempotencyKey: string;
    randomValue: number;
    pointWeights: readonly BlessingPointWeight[];
  }): Promise<BlessingOfferingResult>;
  allocate(input: {
    authUserId: string;
    providerUserId: string;
    offeringId: string;
    allocation: Attributes;
  }): Promise<BlessingAllocationResult>;
};

export type RandomSource = {
  next(): number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createBlessingOffering(input: {
  authUser: VerifiedAuthUser;
  idempotencyKey: string;
  config: OfferingConfig;
  random: RandomSource;
  store: OfferingStore;
}) {
  const identity = requireGitHubIdentity(input.authUser);
  if (!UUID_PATTERN.test(input.idempotencyKey)) {
    throw new InvalidOfferingRequestError();
  }
  const randomValue = input.random.next();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new InvalidOfferingConfigurationError();
  }

  return input.store.create({
    ...identity,
    idempotencyKey: input.idempotencyKey,
    randomValue,
    pointWeights: input.config.blessingPointWeights
  });
}

export async function submitBlessingAllocation(input: {
  authUser: VerifiedAuthUser;
  offeringId: string;
  allocation: unknown;
  store: OfferingStore;
}) {
  const identity = requireGitHubIdentity(input.authUser);
  if (!UUID_PATTERN.test(input.offeringId) || !isAllocation(input.allocation)) {
    throw new InvalidBlessingAllocationError();
  }
  return input.store.allocate({
    ...identity,
    offeringId: input.offeringId,
    allocation: input.allocation
  });
}

export function createSecureRandomSource(): RandomSource {
  return {
    next() {
      return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
    }
  };
}

export class InvalidOfferingRequestError extends Error {
  constructor() {
    super("Offering request is invalid.");
    this.name = "InvalidOfferingRequestError";
  }
}

export class InvalidOfferingConfigurationError extends Error {
  constructor() {
    super("Offering configuration is invalid.");
    this.name = "InvalidOfferingConfigurationError";
  }
}

export class InvalidBlessingAllocationError extends Error {
  constructor() {
    super("Blessing allocation is invalid.");
    this.name = "InvalidBlessingAllocationError";
  }
}

export class OfferingPendingAllocationError extends Error {
  constructor() {
    super("A Blessing allocation is already pending.");
    this.name = "OfferingPendingAllocationError";
  }
}

export class OfferingCooldownError extends Error {
  constructor() {
    super("The Offering cooldown is still active.");
    this.name = "OfferingCooldownError";
  }
}

export class OfferingCollectorRequiredError extends Error {
  constructor() {
    super("An active Collector is required.");
    this.name = "OfferingCollectorRequiredError";
  }
}

export class OfferingTokensRequiredError extends Error {
  constructor() {
    super("At least one Eligible Token is required.");
    this.name = "OfferingTokensRequiredError";
  }
}

export class BlessingAllocationNotFoundError extends Error {
  constructor() {
    super("The pending Blessing allocation was not found.");
    this.name = "BlessingAllocationNotFoundError";
  }
}

function requireGitHubIdentity(authUser: VerifiedAuthUser) {
  const identity = authUser.identities.find(
    ({ provider }) => provider === "github"
  );
  if (!identity?.providerId) {
    throw new Error("Verified GitHub identity is required.");
  }
  return {
    authUserId: authUser.id,
    providerUserId: identity.providerId
  };
}

function isAllocation(value: unknown): value is Attributes {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const allocation = value as Record<string, unknown>;
  const keys = Object.keys(allocation);
  if (
    keys.length !== ATTRIBUTE_KEYS.length ||
    !keys.every((key) =>
      ATTRIBUTE_KEYS.includes(key as (typeof ATTRIBUTE_KEYS)[number])
    )
  ) {
    return false;
  }
  const values = ATTRIBUTE_KEYS.map((attribute) => allocation[attribute]);
  return (
    values.every(
      (points) => Number.isSafeInteger(points) && Number(points) >= 0
    ) &&
    values.reduce<number>((total, points) => total + Number(points), 0) >= 1 &&
    values.reduce<number>((total, points) => total + Number(points), 0) <= 3
  );
}
