import { describe, expect, it } from "vitest";

import {
  createGuestState,
  openGuestState,
  sealGuestState,
  settleGuestState
} from "./guest-state";

const TEST_SECRET = "unit-test-secret-with-at-least-32-characters";

describe("guest onboarding", () => {
  it("creates a temporary character with four base attributes and four points", () => {
    const guest = createGuestState({
      id: "guest-1",
      name: "BraveMoth-482",
      issuedAt: "2026-07-22T00:00:00.000Z"
    });

    expect(guest).toEqual({
      version: 1,
      id: "guest-1",
      name: "BraveMoth-482",
      status: "allocating",
      attributes: {
        courage: 1,
        strength: 1,
        wisdom: 1,
        faith: 1
      },
      unallocatedPoints: 4,
      issuedAt: "2026-07-22T00:00:00.000Z"
    });
  });

  it("rejects an allocation until all four points are assigned", () => {
    const guest = createGuestState({
      id: "guest-1",
      name: "BraveMoth-482",
      issuedAt: "2026-07-22T00:00:00.000Z"
    });

    expect(() =>
      settleGuestState(guest, {
        courage: 1,
        strength: 1,
        wisdom: 1,
        faith: 0
      })
    ).toThrowError("Allocate exactly four points.");
  });

  it("settles a valid allocation into the final character state", () => {
    const guest = createGuestState({
      id: "guest-1",
      name: "BraveMoth-482",
      issuedAt: "2026-07-22T00:00:00.000Z"
    });

    const settled = settleGuestState(guest, {
      courage: 1,
      strength: 1,
      wisdom: 1,
      faith: 1
    });

    expect(settled).toMatchObject({
      status: "ready",
      attributes: {
        courage: 2,
        strength: 2,
        wisdom: 2,
        faith: 2
      },
      unallocatedPoints: 0
    });
  });

  it("does not let a settled temporary state claim initial points again", () => {
    const settled = settleGuestState(
      createGuestState({
        id: "guest-1",
        name: "BraveMoth-482",
        issuedAt: "2026-07-22T00:00:00.000Z"
      }),
      { courage: 1, strength: 1, wisdom: 1, faith: 1 }
    );

    expect(() =>
      settleGuestState(settled, {
        courage: 1,
        strength: 1,
        wisdom: 1,
        faith: 1
      })
    ).toThrowError("Initial allocation is already complete.");
  });

  it("rejects negative or fractional allocation values", () => {
    const guest = createGuestState({
      id: "guest-1",
      name: "BraveMoth-482",
      issuedAt: "2026-07-22T00:00:00.000Z"
    });

    expect(() =>
      settleGuestState(guest, {
        courage: -1,
        strength: 2.5,
        wisdom: 1.5,
        faith: 1
      })
    ).toThrowError("Allocation values must be non-negative integers.");
  });

  it("rejects changes to either the signed content or its signature", () => {
    const token = sealGuestState(
      createGuestState({
        id: "guest-1",
        name: "BraveMoth-482",
        issuedAt: "2026-07-22T00:00:00.000Z"
      }),
      TEST_SECRET
    );
    const [content, signature] = token.split(".");

    expect(() => openGuestState(`${content}x.${signature}`, TEST_SECRET)).toThrow(
      "Guest state signature is invalid."
    );
    expect(() => openGuestState(`${content}.${signature}x`, TEST_SECRET)).toThrow(
      "Guest state signature is invalid."
    );
  });

  it("applies only the allocation rules injected by the server", () => {
    const guest = createGuestState({
      id: "guest-1",
      name: "BraveMoth-482",
      issuedAt: "2026-07-22T00:00:00.000Z"
    });

    const settled = settleGuestState(
      guest,
      { courage: 1, strength: 1, wisdom: 1, faith: 1 },
      [
        {
          when: { courage: 1, strength: 1, wisdom: 1, faith: 1 },
          adjust: { courage: 0, strength: 0, wisdom: 0, faith: 1 }
        }
      ]
    );

    expect(settled.attributes).toEqual({
      courage: 2,
      strength: 2,
      wisdom: 2,
      faith: 3
    });
  });
});
