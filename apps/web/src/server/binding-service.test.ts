import { describe, expect, it } from "vitest";

import type { GuestState } from "@tetraforce/contracts";

import {
  completeCharacterBinding,
  getCharacterBindingState,
  type BindingStore,
  type VerifiedAuthUser
} from "./binding-service";

const authUser: VerifiedAuthUser = {
  id: "4d4ce723-003d-43b2-8123-b8dc351abe0a",
  identities: [{ provider: "github", providerId: "8675309" }]
};

const readyGuest: GuestState = {
  version: 1,
  id: "8f6c1d2e-0b32-4c83-a460-4ae91be7a1f4",
  name: "BraveMoth-482",
  status: "ready",
  attributes: { courage: 5, strength: 1, wisdom: 1, faith: 1 },
  unallocatedPoints: 0,
  issuedAt: "2026-07-22T00:00:00.000Z"
};

const character = {
  id: "94606318-e25f-4dee-ab13-ee58b1747aa0",
  gameName: "Alice_12",
  attributes: readyGuest.attributes
};

function createStore(overrides: Partial<BindingStore> = {}): BindingStore {
  return {
    findByIdentity: async () => null,
    consumeBindingAttempt: async () => undefined,
    complete: async () => ({ character, created: true }),
    ...overrides
  };
}

describe("GitHub Character binding service", () => {
  it("reports anonymous, pending, and active states through the same interface", async () => {
    expect(await getCharacterBindingState(null, createStore())).toEqual({
      status: "anonymous"
    });
    expect(await getCharacterBindingState(authUser, createStore())).toEqual({
      status: "pending"
    });
    expect(
      await getCharacterBindingState(
        authUser,
        createStore({ findByIdentity: async () => character })
      )
    ).toEqual({ status: "active", character });
  });

  it("creates a Character with verified identity, normalized name, Guest state, and current consent", async () => {
    let received: Parameters<BindingStore["complete"]>[0] | undefined;
    const store = createStore({
      complete: async (input) => {
        received = input;
        return { character, created: true };
      }
    });

    const result = await completeCharacterBinding({
      authUser,
      guest: readyGuest,
      gameName: "Ａｌｉｃｅ_１２",
      acceptedTerms: true,
      acceptedPrivacy: true,
      store
    });

    expect(result).toEqual({ character, created: true });
    expect(received).toEqual({
      authUserId: authUser.id,
      providerUserId: "8675309",
      gameName: "Alice_12",
      normalizedGameName: "alice_12",
      attributes: readyGuest.attributes,
      termsVersion: "2026-07-22",
      privacyVersion: "2026-07-22"
    });
  });

  it("requires both active consents before creating any persistent records", async () => {
    const store = createStore({
      complete: async () => {
        throw new Error("store must not be called");
      }
    });

    await expect(
      completeCharacterBinding({
        authUser,
        guest: readyGuest,
        gameName: "Alice_12",
        acceptedTerms: true,
        acceptedPrivacy: false,
        store
      })
    ).rejects.toThrow("Current Terms and Privacy consent is required.");
  });

  it("stops a rate-limited identity before creating persistent records", async () => {
    const store = createStore({
      consumeBindingAttempt: async () => {
        throw new Error("Too many Character binding attempts.");
      },
      complete: async () => {
        throw new Error("complete must not be called");
      }
    });

    await expect(
      completeCharacterBinding({
        authUser,
        guest: readyGuest,
        gameName: "Alice_12",
        acceptedTerms: true,
        acceptedPrivacy: true,
        store
      })
    ).rejects.toThrow("Too many Character binding attempts.");
  });

  it("uses only a verified GitHub provider identity", async () => {
    await expect(
      completeCharacterBinding({
        authUser: { id: authUser.id, identities: [{ provider: "email", providerId: "8675309" }] },
        guest: readyGuest,
        gameName: "Alice_12",
        acceptedTerms: true,
        acceptedPrivacy: true,
        store: createStore()
      })
    ).rejects.toThrow("Verified GitHub identity is required.");
  });

  it("rejects invalid Game Names before calling the store", async () => {
    await expect(
      completeCharacterBinding({
        authUser,
        guest: readyGuest,
        gameName: "Admin",
        acceptedTerms: true,
        acceptedPrivacy: true,
        store: createStore()
      })
    ).rejects.toThrow("Game Name is reserved.");
  });
});
