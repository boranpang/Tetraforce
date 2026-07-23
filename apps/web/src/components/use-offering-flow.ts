"use client";

import {
  ATTRIBUTE_KEYS,
  type Attributes,
  type BlessingAllocationResult,
  type BlessingOfferingResult,
  type OfferingErrorResponse
} from "@tetraforce/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PersistentCharacter } from "../server/binding-service";
import type { TempleSyncState } from "../server/temple-sync-store";
import { copy, type Locale } from "../i18n";

const EMPTY_ALLOCATION: Attributes = {
  courage: 0,
  strength: 0,
  wisdom: 0,
  faith: 0
};

type OfferingPhase =
  | "idle"
  | "refreshing"
  | "confirming"
  | "offering"
  | "revealing"
  | "allocating";

export function useOfferingFlow({
  character,
  locale
}: {
  character: PersistentCharacter;
  locale: Locale;
}) {
  const text = copy[locale];
  const [templeState, setTempleState] = useState<TempleSyncState | null>(null);
  const [stateUnavailable, setStateUnavailable] = useState(false);
  const [phase, setPhase] = useState<OfferingPhase>("idle");
  const [allocation, setAllocation] = useState<Attributes>(EMPTY_ALLOCATION);
  const [error, setError] = useState<string | null>(null);
  const [allocationComplete, setAllocationComplete] = useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [serverClock, setServerClock] = useState<{
    serverNow: number;
    clientNow: number;
  } | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const pendingOfferingIdRef = useRef<string | null>(null);

  const loadState = useCallback(async () => {
    const response = await fetch("/api/v1/temple/sync-state", {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("Temple state unavailable");
    }
    const state = (await response.json()) as TempleSyncState;
    const clientNow = Date.now();
    setTempleState(state);
    setServerClock({
      serverNow: Date.parse(state.serverNow),
      clientNow
    });
    setClockTick(clientNow);
    setStateUnavailable(false);
    setError(null);
    const recoveredOfferingId = state.pendingOffering?.offeringId ?? null;
    if (pendingOfferingIdRef.current !== recoveredOfferingId) {
      pendingOfferingIdRef.current = recoveredOfferingId;
      setAllocation(EMPTY_ALLOCATION);
      setAllocationComplete(false);
    }
    return state;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadState().catch(() => {
      if (!cancelled) {
        setStateUnavailable(true);
      }
    });
    const reconnect = () => {
      void loadState().catch(() => setStateUnavailable(true));
    };
    window.addEventListener("online", reconnect);
    return () => {
      cancelled = true;
      window.removeEventListener("online", reconnect);
    };
  }, [loadState]);

  useEffect(() => {
    if (
      !templeState?.cooldownEndsAt ||
      templeState.offerBlockReason !== "cooldown" ||
      !serverClock
    ) {
      return;
    }
    const remaining =
      Date.parse(templeState.cooldownEndsAt) -
      (serverClock.serverNow + (Date.now() - serverClock.clientNow));
    if (remaining <= 0) {
      return;
    }
    const timer = window.setTimeout(
      () => void loadState().catch(() => setStateUnavailable(true)),
      remaining + 25
    );
    return () => window.clearTimeout(timer);
  }, [
    loadState,
    serverClock,
    templeState?.cooldownEndsAt,
    templeState?.offerBlockReason
  ]);

  useEffect(() => {
    if (
      !templeState?.cooldownEndsAt ||
      templeState.offerBlockReason !== "cooldown"
    ) {
      return;
    }
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [templeState?.cooldownEndsAt, templeState?.offerBlockReason]);

  const pendingOffering = templeState?.pendingOffering ?? null;
  const allocatedPoints = ATTRIBUTE_KEYS.reduce(
    (total, attribute) => total + allocation[attribute],
    0
  );
  const remainingPoints =
    (pendingOffering?.awardedPoints ?? 0) - allocatedPoints;
  const cooldownRemaining = useMemo(
    () => formatCooldown(templeState, clockTick, serverClock),
    [clockTick, serverClock, templeState]
  );

  async function reviewOffering() {
    setPhase("refreshing");
    setError(null);
    try {
      const state = await loadState();
      setPhase(state.canOffer ? "confirming" : "idle");
    } catch {
      setStateUnavailable(true);
      setError(text.offering.stateFailure);
      setPhase("idle");
    }
  }

  async function confirmOffering() {
    setPhase("offering");
    setError(null);
    idempotencyKeyRef.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/offerings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current
        })
      });
      if (!response.ok) {
        const problem = await readOfferingProblem(response);
        if (problem?.code === "OFFERING_PENDING_ALLOCATION") {
          const recovered = await loadState();
          if (recovered.pendingOffering) {
            idempotencyKeyRef.current = null;
            setPhase("idle");
            return;
          }
        }
        throw new Error("Offering failed");
      }
      const result = (await response.json()) as BlessingOfferingResult;
      idempotencyKeyRef.current = null;
      let restoredReplay = false;
      if (result.replayed) {
        try {
          const restored = await loadState();
          restoredReplay = true;
          if (!restored.pendingOffering) {
            setPhase("idle");
            return;
          }
        } catch {
          // Keep the replayed result visible when authoritative refresh is down.
        }
      }
      if (!restoredReplay) {
        setTempleState((current) =>
          current ? applyOfferingResult(current, result) : current
        );
      }
      pendingOfferingIdRef.current = result.offeringId;
      const clientNow = Date.now();
      setServerClock({
        serverNow: Date.parse(result.createdAt),
        clientNow
      });
      setClockTick(clientNow);
      setAllocation(EMPTY_ALLOCATION);
      setAllocationComplete(false);

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (reduceMotion) {
        setPhase("idle");
      } else {
        setPhase("revealing");
        window.setTimeout(() => setPhase("idle"), 1200);
      }
    } catch {
      setError(text.offering.failure);
      setPhase("confirming");
    }
  }

  function changeAllocation(
    attribute: keyof Attributes,
    change: 1 | -1
  ) {
    setAllocation((current) => ({
      ...current,
      [attribute]: current[attribute] + change
    }));
  }

  async function confirmAllocation() {
    if (!pendingOffering || remainingPoints !== 0) {
      return;
    }
    setPhase("allocating");
    setError(null);
    try {
      const response = await fetch("/api/v1/offerings/allocation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offeringId: pendingOffering.offeringId,
          allocation
        })
      });
      if (!response.ok) {
        throw new Error("Allocation failed");
      }
      const result = (await response.json()) as BlessingAllocationResult;
      setTempleState((current) =>
        current ? applyAllocationResult(current, result) : current
      );
      pendingOfferingIdRef.current = null;
      setAllocation(EMPTY_ALLOCATION);
      setAllocationComplete(true);
      setPhase("idle");
      void loadState().catch(() => setStateUnavailable(true));
    } catch {
      setError(text.offering.allocationFailure);
      setPhase("idle");
    }
  }

  const isConfirming = phase === "confirming" || phase === "offering";
  const isOffering = phase === "offering";
  const isAllocating = phase === "allocating";
  const isRevealing = phase === "revealing";

  return {
    allocation,
    allocationComplete,
    changeAllocation,
    confirmAllocation,
    confirmOffering,
    cooldownRemaining,
    currentCharacter: templeState?.character ?? character,
    error,
    isAllocating,
    isConfirming,
    isOffering,
    isRefreshing: phase === "refreshing",
    isRevealing,
    loadState,
    pendingOffering,
    remainingPoints,
    reviewOffering,
    setConfirming(confirming: boolean) {
      if (!isOffering) {
        setPhase(confirming ? "confirming" : "idle");
      }
    },
    stateUnavailable,
    templeState
  };
}

async function readOfferingProblem(response: Response) {
  try {
    return (await response.json()) as OfferingErrorResponse;
  } catch {
    return null;
  }
}

function applyOfferingResult(
  state: TempleSyncState,
  result: BlessingOfferingResult
): TempleSyncState {
  return {
    ...state,
    aggregates: {
      ...state.aggregates,
      totalTokensOffered: addTokenStrings(
        state.aggregates.totalTokensOffered,
        result.offeredTokens
      ),
      agentTokensOffered: {
        claudeCode: addTokenStrings(
          state.aggregates.agentTokensOffered.claudeCode,
          result.agentTokens.claudeCode
        ),
        codex: addTokenStrings(
          state.aggregates.agentTokensOffered.codex,
          result.agentTokens.codex
        )
      },
      offeringCount: state.aggregates.offeringCount + 1,
      rankEligible: true,
      attainedAt: {
        ...state.aggregates.attainedAt,
        totalTokens: result.createdAt
      }
    },
    eligibleTokens: "0",
    serverNow: result.createdAt,
    cooldownEndsAt: result.cooldownEndsAt,
    pendingOffering: result,
    canOffer: false,
    offerBlockReason: "pending-allocation"
  };
}

function applyAllocationResult(
  state: TempleSyncState,
  result: BlessingAllocationResult
): TempleSyncState {
  return {
    ...state,
    character: {
      ...state.character,
      attributes: result.attributes
    },
    pendingOffering: null,
    canOffer: false,
    offerBlockReason: "cooldown"
  };
}

function addTokenStrings(left: string, right: string) {
  return (BigInt(left) + BigInt(right)).toString();
}

function formatCooldown(
  state: TempleSyncState | null,
  now: number,
  clock: { serverNow: number; clientNow: number } | null
) {
  if (!state?.cooldownEndsAt || !clock) {
    return null;
  }
  const currentServerTime = clock.serverNow + (now - clock.clientNow);
  const remaining = Math.max(
    0,
    Date.parse(state.cooldownEndsAt) - currentServerTime
  );
  if (remaining === 0) {
    return null;
  }
  const seconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
