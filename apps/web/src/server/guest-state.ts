import { createHmac, timingSafeEqual } from "node:crypto";

import {
  ATTRIBUTE_KEYS,
  type AllocationRule,
  type Attributes,
  type GuestState
} from "@tetraforce/contracts";

type CreateGuestStateInput = Pick<GuestState, "id" | "name" | "issuedAt">;

export function createGuestState(input: CreateGuestStateInput): GuestState {
  return {
    version: 1,
    ...input,
    status: "allocating",
    attributes: {
      courage: 1,
      strength: 1,
      wisdom: 1,
      faith: 1
    },
    unallocatedPoints: 4
  };
}

export function settleGuestState(
  guest: GuestState,
  allocation: Attributes,
  rules: readonly AllocationRule[] = []
): GuestState {
  if (guest.status !== "allocating") {
    throw new Error("Initial allocation is already complete.");
  }

  const hasInvalidValue = ATTRIBUTE_KEYS.some(
    (attribute) =>
      !Number.isInteger(allocation[attribute]) || allocation[attribute] < 0
  );

  if (hasInvalidValue) {
    throw new Error("Allocation values must be non-negative integers.");
  }

  const allocatedPoints = ATTRIBUTE_KEYS.reduce(
    (total, attribute) => total + allocation[attribute],
    0
  );

  if (allocatedPoints !== guest.unallocatedPoints) {
    throw new Error("Allocate exactly four points.");
  }

  const allocatedAttributes = Object.fromEntries(
    ATTRIBUTE_KEYS.map((attribute) => [
      attribute,
      guest.attributes[attribute] + allocation[attribute]
    ])
  ) as Attributes;
  const matchingRule = rules.find((rule) =>
    ATTRIBUTE_KEYS.every(
      (attribute) => rule.when[attribute] === allocation[attribute]
    )
  );

  const finalAttributes = matchingRule
    ? (Object.fromEntries(
        ATTRIBUTE_KEYS.map((attribute) => [
          attribute,
          allocatedAttributes[attribute] + matchingRule.adjust[attribute]
        ])
      ) as Attributes)
    : allocatedAttributes;

  return {
    ...guest,
    status: "ready",
    attributes: finalAttributes,
    unallocatedPoints: 0
  };
}

export function sealGuestState(guest: GuestState, secret: string): string {
  const content = Buffer.from(JSON.stringify(guest)).toString("base64url");
  const signature = sign(content, secret);
  return `${content}.${signature}`;
}

export function openGuestState(token: string, secret: string): GuestState {
  const [content, suppliedSignature, extra] = token.split(".");
  if (!content || !suppliedSignature || extra) {
    throw new Error("Guest state signature is invalid.");
  }

  const expectedSignature = sign(content, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  const isValid =
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer);

  if (!isValid) {
    throw new Error("Guest state signature is invalid.");
  }

  return JSON.parse(Buffer.from(content, "base64url").toString("utf8")) as GuestState;
}

function sign(content: string, secret: string): string {
  return createHmac("sha256", secret).update(content).digest("base64url");
}
