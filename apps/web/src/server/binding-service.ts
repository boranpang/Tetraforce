import type { Attributes, GuestState } from "@tetraforce/contracts";

import {
  CURRENT_LEGAL_VERSION,
  assertBindableGuestState,
  validateGameName
} from "./binding-policy";

export type VerifiedAuthUser = {
  id: string;
  identities: readonly {
    provider: string;
    providerId: string;
  }[];
};

export type PersistentCharacter = {
  id: string;
  gameName: string;
  attributes: Attributes;
};

export type VerifiedGitHubIdentity = {
  authUserId: string;
  providerUserId: string;
};

export type CompleteBindingInput = VerifiedGitHubIdentity & {
  gameName: string;
  normalizedGameName: string;
  attributes: Attributes;
  termsVersion: string;
  privacyVersion: string;
};

export type BindingStore = {
  findByIdentity(identity: VerifiedGitHubIdentity): Promise<PersistentCharacter | null>;
  consumeBindingAttempt(identity: VerifiedGitHubIdentity): Promise<void>;
  complete(input: CompleteBindingInput): Promise<{
    character: PersistentCharacter;
    created: boolean;
  }>;
};

export type CharacterBindingState =
  | { status: "anonymous" }
  | { status: "pending" }
  | { status: "active"; character: PersistentCharacter };

export async function getCharacterBindingState(
  authUser: VerifiedAuthUser | null,
  store: BindingStore
): Promise<CharacterBindingState> {
  if (!authUser) {
    return { status: "anonymous" };
  }

  const identity = getGitHubIdentity(authUser);
  if (!identity) {
    return { status: "anonymous" };
  }

  const character = await store.findByIdentity(identity);
  return character ? { status: "active", character } : { status: "pending" };
}

export async function completeCharacterBinding(input: {
  authUser: VerifiedAuthUser;
  guest: GuestState;
  gameName: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  store: BindingStore;
}) {
  const identity = getGitHubIdentity(input.authUser);
  if (!identity) {
    throw new Error("Verified GitHub identity is required.");
  }

  await input.store.consumeBindingAttempt(identity);

  if (!input.acceptedTerms || !input.acceptedPrivacy) {
    throw new Error("Current Terms and Privacy consent is required.");
  }

  const validation = validateGameName(input.gameName);
  if (!validation.ok) {
    throw new Error(gameNameError(validation.reason));
  }

  const guest = assertBindableGuestState(input.guest);
  return input.store.complete({
    ...identity,
    gameName: validation.gameName,
    normalizedGameName: validation.normalizedGameName,
    attributes: guest.attributes,
    termsVersion: CURRENT_LEGAL_VERSION,
    privacyVersion: CURRENT_LEGAL_VERSION
  });
}

function getGitHubIdentity(authUser: VerifiedAuthUser): VerifiedGitHubIdentity | null {
  const identity = authUser.identities.find(({ provider }) => provider === "github");
  if (!identity?.providerId) {
    return null;
  }

  return {
    authUserId: authUser.id,
    providerUserId: identity.providerId
  };
}

function gameNameError(reason: "length" | "characters" | "reserved") {
  switch (reason) {
    case "length":
      return "Game Name must contain 3-16 characters.";
    case "characters":
      return "Game Name may contain only letters, numbers, and underscore.";
    case "reserved":
      return "Game Name is reserved.";
  }
}
