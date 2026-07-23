export const ATTRIBUTE_KEYS = [
  "courage",
  "strength",
  "wisdom",
  "faith"
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

export type GuestState = {
  version: 1;
  id: string;
  name: string;
  status: "allocating" | "ready";
  attributes: Attributes;
  unallocatedPoints: number;
  issuedAt: string;
};

export type AllocationRule = {
  when: Attributes;
  adjust: Attributes;
};

export * from "./device-binding";
export * from "./usage-summary";
