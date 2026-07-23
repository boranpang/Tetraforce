import type { Attributes } from "./index";

export type OfferingBlockReason =
  | "collector"
  | "tokens"
  | "cooldown"
  | "pending-allocation";

export type BlessingOfferingResult = {
  offeringId: string;
  resultType: "blessing";
  offeredTokens: string;
  agentTokens: {
    claudeCode: string;
    codex: string;
  };
  awardedPoints: number;
  createdAt: string;
  cooldownEndsAt: string;
  replayed: boolean;
};

export type TempleState = {
  character: {
    id: string;
    gameName: string;
    attributes: Attributes;
  };
  aggregates: {
    totalTokensOffered: string;
    agentTokensOffered: {
      claudeCode: string;
      codex: string;
    };
    offeringCount: number;
    rankEligible: boolean;
    attainedAt: {
      totalTokens: string | null;
      courage: string;
      strength: string;
      wisdom: string;
      faith: string;
    };
  };
  collector: {
    connected: boolean;
    lastSuccessfulSyncAt: string | null;
    stale: boolean;
  };
  eligibleTokens: string;
  serverNow: string;
  cooldownEndsAt: string | null;
  pendingOffering: BlessingOfferingResult | null;
  canOffer: boolean;
  offerBlockReason: OfferingBlockReason | null;
};

export type BlessingAllocationRequest = {
  offeringId: string;
  allocation: Attributes;
};

export type BlessingAllocationResult = {
  attributes: Attributes;
  replayed: boolean;
};

export type OfferingErrorCode =
  | "OFFERING_REQUEST_INVALID"
  | "OFFERING_PENDING_ALLOCATION"
  | "OFFERING_COOLDOWN"
  | "OFFERING_COLLECTOR_REQUIRED"
  | "OFFERING_TOKENS_REQUIRED"
  | "BLESSING_ALLOCATION_INVALID"
  | "BLESSING_ALLOCATION_NOT_FOUND"
  | "OFFERING_UNAVAILABLE";

export type OfferingErrorResponse = {
  code: OfferingErrorCode;
  error: string;
};
