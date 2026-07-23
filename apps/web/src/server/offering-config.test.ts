import { afterEach, describe, expect, it } from "vitest";

import {
  getOfferingConfig,
  parseOfferingConfig
} from "./offering-config";

afterEach(() => {
  delete process.env.TETRAFORCE_BLESSING_POINT_WEIGHTS;
});

describe("Blessing Offering configuration", () => {
  it("accepts an injectable non-production point distribution without assuming production values", () => {
    expect(
      parseOfferingConfig(
        JSON.stringify([
          { points: 1, weight: 1 },
          { points: 2, weight: 2 },
          { points: 3, weight: 1 }
        ])
      )
    ).toEqual({
      blessingPointWeights: [
        { points: 1, weight: 1 },
        { points: 2, weight: 2 },
        { points: 3, weight: 1 }
      ]
    });
  });

  it("requires the private server environment and rejects incomplete distributions", () => {
    expect(() => getOfferingConfig()).toThrow(
      "TETRAFORCE_BLESSING_POINT_WEIGHTS is required."
    );
    expect(() =>
      parseOfferingConfig(
        JSON.stringify([
          { points: 1, weight: 1 },
          { points: 2, weight: 1 }
        ])
      )
    ).toThrow("TETRAFORCE_BLESSING_POINT_WEIGHTS is invalid.");
  });
});
