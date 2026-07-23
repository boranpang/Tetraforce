export type BlessingPointWeight = {
  points: 1 | 2 | 3;
  weight: number;
};

export type OfferingConfig = {
  blessingPointWeights: readonly BlessingPointWeight[];
};

export function getOfferingConfig(): OfferingConfig {
  const serializedWeights =
    process.env.TETRAFORCE_BLESSING_POINT_WEIGHTS?.trim();
  if (!serializedWeights) {
    throw new Error("TETRAFORCE_BLESSING_POINT_WEIGHTS is required.");
  }
  return parseOfferingConfig(serializedWeights);
}

export function parseOfferingConfig(serializedWeights: string): OfferingConfig {
  let value: unknown;
  try {
    value = JSON.parse(serializedWeights);
  } catch {
    throw new Error("TETRAFORCE_BLESSING_POINT_WEIGHTS is invalid.");
  }

  if (!isBlessingPointWeights(value)) {
    throw new Error("TETRAFORCE_BLESSING_POINT_WEIGHTS is invalid.");
  }
  return { blessingPointWeights: value };
}

function isBlessingPointWeights(value: unknown): value is BlessingPointWeight[] {
  if (!Array.isArray(value) || value.length !== 3) {
    return false;
  }
  return value.every((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    const candidate = item as Record<string, unknown>;
    return (
      Object.keys(candidate).length === 2 &&
      candidate.points === index + 1 &&
      Number.isSafeInteger(candidate.weight) &&
      Number(candidate.weight) > 0
    );
  });
}
