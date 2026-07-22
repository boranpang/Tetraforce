import { ATTRIBUTE_KEYS, type GuestState } from "@tetraforce/contracts";
import { caseFold } from "unicode-case-folding";

export const CURRENT_LEGAL_VERSION = "2026-07-22";

const RESERVED_GAME_NAMES = [
  "tetraforce",
  "admin",
  "administrator",
  "official",
  "moderator",
  "goddess",
  "support",
  "管理员",
  "官方",
  "女神",
  "客服"
] as const;

const RESERVED_GAME_NAME_KEYS = new Set(RESERVED_GAME_NAMES.map(toUniquenessKey));
const GAME_NAME_CHARACTERS = /^[\p{L}\p{N}_]+$/u;
const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

type ValidGameName = {
  ok: true;
  gameName: string;
  normalizedGameName: string;
};

type InvalidGameName = {
  ok: false;
  reason: "length" | "characters" | "reserved";
};

export type GameNameValidation = ValidGameName | InvalidGameName;

export function validateGameName(input: string): GameNameValidation {
  const gameName = input.normalize("NFKC");
  const graphemeCount = Array.from(graphemeSegmenter.segment(gameName)).length;

  if (graphemeCount < 3 || graphemeCount > 16) {
    return { ok: false, reason: "length" };
  }

  if (!GAME_NAME_CHARACTERS.test(gameName)) {
    return { ok: false, reason: "characters" };
  }

  const normalizedGameName = toUniquenessKey(gameName);
  if (RESERVED_GAME_NAME_KEYS.has(normalizedGameName)) {
    return { ok: false, reason: "reserved" };
  }

  return { ok: true, gameName, normalizedGameName };
}

export function assertBindableGuestState(guest: GuestState): GuestState {
  if (guest.status !== "ready" || guest.unallocatedPoints !== 0) {
    throw new Error("Guest Character must complete Initial Allocation before binding.");
  }

  const hasInvalidAttribute = ATTRIBUTE_KEYS.some(
    (attribute) =>
      !Number.isInteger(guest.attributes[attribute]) || guest.attributes[attribute] < 0
  );

  if (guest.version !== 1 || !guest.id || !guest.name || hasInvalidAttribute) {
    throw new Error("Guest Character state is invalid.");
  }

  return guest;
}

function toUniquenessKey(value: string) {
  return caseFold(value.normalize("NFKC")).normalize("NFKC");
}
