import "server-only";

import {
  ATTRIBUTE_KEYS,
  type AllocationRule,
  type Attributes
} from "@tetraforce/contracts";

export type GuestConfig = {
  secret: string;
  rules: readonly AllocationRule[];
};

export function getGuestConfig(): GuestConfig {
  const secret = process.env.TETRAFORCE_GUEST_STATE_SECRET;
  const serializedRules = process.env.TETRAFORCE_GUEST_ALLOCATION_RULES;

  if (!secret || secret.length < 32) {
    throw new Error("TETRAFORCE_GUEST_STATE_SECRET must contain at least 32 characters.");
  }

  if (!serializedRules) {
    throw new Error("TETRAFORCE_GUEST_ALLOCATION_RULES is required.");
  }

  const rules = JSON.parse(serializedRules) as unknown;
  if (!Array.isArray(rules) || !rules.every(isAllocationRule)) {
    throw new Error("TETRAFORCE_GUEST_ALLOCATION_RULES is invalid.");
  }

  return { secret, rules };
}

function isAllocationRule(value: unknown): value is AllocationRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { when?: unknown; adjust?: unknown };
  return isAttributes(candidate.when, true) && isAttributes(candidate.adjust, false);
}

function isAttributes(value: unknown, requireFourPoints: boolean): value is Attributes {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const values = ATTRIBUTE_KEYS.map((attribute) => candidate[attribute]);
  const keysAreExact =
    Object.keys(candidate).length === ATTRIBUTE_KEYS.length &&
    Object.keys(candidate).every((key) =>
      ATTRIBUTE_KEYS.includes(key as (typeof ATTRIBUTE_KEYS)[number])
    );
  const valuesAreValid = values.every(
    (item) => Number.isInteger(item) && (!requireFourPoints || Number(item) >= 0)
  );

  return (
    keysAreExact &&
    valuesAreValid &&
    (!requireFourPoints || values.reduce<number>((sum, item) => sum + Number(item), 0) === 4)
  );
}
