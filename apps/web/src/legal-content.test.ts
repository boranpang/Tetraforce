import { describe, expect, it } from "vitest";

import { USAGE_SUMMARY_FIELDS } from "@tetraforce/contracts";
import { legalContent } from "./legal-content";

describe("legal content", () => {
  it("keeps the Usage Summary allowlist and explanations in one bilingual source", () => {
    expect(USAGE_SUMMARY_FIELDS.map(({ key }) => key)).toEqual([
      "summaryKey",
      "agent",
      "utcHour",
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
      "cacheWriteTokens",
      "collectorVersion",
      "sourceLogFormatVersion"
    ]);

    for (const field of USAGE_SUMMARY_FIELDS) {
      expect(field.label.en).not.toBe("");
      expect(field.label.zh).not.toBe("");
      expect(field.description.en).not.toBe("");
      expect(field.description.zh).not.toBe("");
    }
  });

  it("keeps English and Chinese legal documents structurally aligned", () => {
    for (const document of ["privacy", "terms", "contact"] as const) {
      expect(legalContent.en[document].sections.map(({ id }) => id)).toEqual(
        legalContent.zh[document].sections.map(({ id }) => id)
      );
    }
  });
});
