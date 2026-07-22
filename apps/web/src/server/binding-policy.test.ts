import { describe, expect, it } from "vitest";

import type { GuestState } from "@tetraforce/contracts";

import {
  CURRENT_LEGAL_VERSION,
  assertBindableGuestState,
  validateGameName
} from "./binding-policy";

describe("GitHub Character binding policy", () => {
  it("uses the legal documents' effective date as both consent versions", () => {
    expect(CURRENT_LEGAL_VERSION).toBe("2026-07-22");
  });

  it("normalizes a valid Game Name for display and case-insensitive uniqueness", () => {
    expect(validateGameName("Ａｌｉｃｅ_１２")).toEqual({
      ok: true,
      gameName: "Alice_12",
      normalizedGameName: "alice_12"
    });
    expect(validateGameName("ALICE")).toMatchObject({
      ok: true,
      normalizedGameName: "alice"
    });
    expect(validateGameName("Alice")).toMatchObject({
      ok: true,
      normalizedGameName: "alice"
    });
    expect(validateGameName("Straße")).toMatchObject({
      ok: true,
      normalizedGameName: "strasse"
    });
    expect(validateGameName("STRASSE")).toMatchObject({
      ok: true,
      normalizedGameName: "strasse"
    });
  });

  it("counts 3-16 graphemes after NFKC normalization", () => {
    expect(validateGameName("勇気_7").ok).toBe(true);
    expect(validateGameName("e\u0301x2")).toMatchObject({
      ok: true,
      gameName: "éx2"
    });
    expect(validateGameName("ab")).toEqual({
      ok: false,
      reason: "length"
    });
    expect(validateGameName("abcdefghijklmnopq")).toEqual({
      ok: false,
      reason: "length"
    });
  });

  it("allows only Unicode letters, numbers, and underscore", () => {
    for (const gameName of ["Alice Smith", "alice.dev", "勇者🔥", "abc\u202E"]) {
      expect(validateGameName(gameName)).toEqual({
        ok: false,
        reason: "characters"
      });
    }
  });

  it("rejects exact reserved names without rejecting names that merely contain them", () => {
    expect(validateGameName("Admin")).toEqual({
      ok: false,
      reason: "reserved"
    });
    expect(validateGameName("ＡＤＭＩＮ")).toEqual({
      ok: false,
      reason: "reserved"
    });
    expect(validateGameName("AdminCat")).toMatchObject({ ok: true });
  });

  it("accepts only a completed signed Guest Character state for binding", () => {
    const readyGuest: GuestState = {
      version: 1,
      id: "8f6c1d2e-0b32-4c83-a460-4ae91be7a1f4",
      name: "BraveMoth-482",
      status: "ready",
      attributes: { courage: 5, strength: 1, wisdom: 1, faith: 1 },
      unallocatedPoints: 0,
      issuedAt: "2026-07-22T00:00:00.000Z"
    };

    expect(assertBindableGuestState(readyGuest)).toEqual(readyGuest);
    expect(() =>
      assertBindableGuestState({ ...readyGuest, status: "allocating", unallocatedPoints: 4 })
    ).toThrow("Guest Character must complete Initial Allocation before binding.");
    expect(() =>
      assertBindableGuestState({
        ...readyGuest,
        attributes: { ...readyGuest.attributes, courage: -1 }
      })
    ).toThrow("Guest Character state is invalid.");
  });
});
