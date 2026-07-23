import { expect, test } from "@playwright/test";

const character = {
  id: "94606318-e25f-4dee-ab13-ee58b1747aa0",
  gameName: "ServerHero",
  attributes: { courage: 2, strength: 2, wisdom: 2, faith: 2 }
};

test("an eligible player can review the latest Token snapshot and cancel without settlement", async ({
  page
}) => {
  let offeringRequests = 0;
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "active", character } })
  );
  await page.route("**/api/v1/temple/sync-state", (route) =>
    route.fulfill({ json: templeState() })
  );
  await page.route("**/api/v1/offerings", (route) => {
    offeringRequests += 1;
    return route.fulfill({ status: 500 });
  });

  await page.goto("/en");
  const offer = page.getByRole("button", { name: "Offer Tokens" });
  await expect(offer).toBeEnabled();
  await offer.click();

  const dialog = page.getByRole("dialog", { name: "Offer all Eligible Tokens?" });
  await expect(dialog).toContainText("30");
  await expect(dialog).toContainText("irreversible");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(dialog).not.toBeVisible();
  expect(offeringRequests).toBe(0);
});

test("a reduced-motion Blessing restores the actual settlement and preserves allocation preview after failure", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let allocationAttempts = 0;
  let idempotencyKey: string | undefined;
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "active", character } })
  );
  await page.route("**/api/v1/temple/sync-state", (route) =>
    route.fulfill({
      json:
        allocationAttempts > 1
          ? templeState({
              character: {
                ...character,
                attributes: { courage: 4, strength: 2, wisdom: 2, faith: 2 }
              },
              eligibleTokens: "0",
              cooldownEndsAt: "2026-07-23T18:00:00.000Z",
              canOffer: false,
              offerBlockReason: "cooldown"
            })
          : templeState()
    })
  );
  await page.route("**/api/v1/offerings", async (route) => {
    idempotencyKey = (route.request().postDataJSON() as {
      idempotencyKey: string;
    }).idempotencyKey;
    await route.fulfill({
      json: {
        offeringId: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
        resultType: "blessing",
        offeredTokens: "35",
        agentTokens: { claudeCode: "10", codex: "25" },
        awardedPoints: 2,
        createdAt: "2026-07-23T06:00:00.000Z",
        cooldownEndsAt: "2026-07-23T18:00:00.000Z",
        replayed: false
      }
    });
  });
  await page.route("**/api/v1/offerings/allocation", async (route) => {
    allocationAttempts += 1;
    if (allocationAttempts === 1) {
      await route.fulfill({ status: 503, json: { code: "OFFERING_UNAVAILABLE" } });
      return;
    }
    await route.fulfill({
      json: {
        attributes: { courage: 4, strength: 2, wisdom: 2, faith: 2 },
        replayed: false
      }
    });
  });

  await page.goto("/en");
  await page.getByRole("button", { name: "Offer Tokens" }).click();
  const dialog = page.getByRole("dialog", { name: "Offer all Eligible Tokens?" });
  await dialog.getByRole("button", { name: "Offer Tokens" }).click();

  await expect(page.getByRole("status")).toContainText("Blessing");
  await expect(page.getByRole("status")).toContainText("35");
  expect(idempotencyKey).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );

  const courage = page.getByRole("group", { name: "Courage" });
  const couragePlus = courage.getByRole("button", { name: "Courage +1" });
  await couragePlus.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Confirm Allocation" }).click();

  await expect(page.getByText(/Your allocation was not saved/)).toBeVisible();
  await expect(courage).toContainText("4");
  await expect(page.getByText("0 points remaining")).toBeVisible();

  await page.getByRole("button", { name: "Confirm Allocation" }).click();
  await expect(page.getByText("Blessing allocated.")).toBeVisible();
  expect(allocationAttempts).toBe(2);
});

test("refresh restores the same pending Blessing with zero and compressed high attributes", async ({
  page
}) => {
  const recoveredCharacter = {
    ...character,
    attributes: { courage: 0, strength: 21, wisdom: 2, faith: 2 }
  };
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({
      json: { status: "active", character: recoveredCharacter }
    })
  );
  await page.route("**/api/v1/temple/sync-state", (route) =>
    route.fulfill({
      json: templeState({
        character: recoveredCharacter,
        eligibleTokens: "12",
        serverNow: "2026-07-23T19:00:00.000Z",
        cooldownEndsAt: "2026-07-23T18:00:00.000Z",
        pendingOffering: {
          offeringId: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
          resultType: "blessing",
          offeredTokens: "35",
          agentTokens: { claudeCode: "10", codex: "25" },
          awardedPoints: 2,
          createdAt: "2026-07-23T06:00:00.000Z",
          cooldownEndsAt: "2026-07-23T18:00:00.000Z",
          replayed: true
        },
        canOffer: false,
        offerBlockReason: "pending-allocation"
      })
    })
  );

  await page.goto("/en");

  await expect(page.getByRole("status")).toContainText("Blessing");
  const courage = page.getByRole("group", { name: "Courage" });
  await expect(courage).toContainText("0");
  await expect(courage.locator(".empty-slot")).toHaveCount(1);
  const strength = page.getByRole("group", { name: "Strength" });
  await expect(strength).toContainText("+1");
  await expect(strength.locator(".attribute-bars span")).toHaveCount(20);
  await expect(
    courage.getByRole("button", { name: "Courage -1" })
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Offer Tokens" })).toBeDisabled();
});

test("an uncertain response retries the same idempotency key and reveals one result", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const keys: string[] = [];
  let settled = false;
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "active", character } })
  );
  await page.route("**/api/v1/temple/sync-state", (route) =>
    route.fulfill({
      json: settled
        ? templeState({
            eligibleTokens: "0",
            cooldownEndsAt: "2026-07-23T18:00:00.000Z",
            pendingOffering: {
              offeringId: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
              resultType: "blessing",
              offeredTokens: "30",
              agentTokens: { claudeCode: "10", codex: "20" },
              awardedPoints: 2,
              createdAt: "2026-07-23T06:00:00.000Z",
              cooldownEndsAt: "2026-07-23T18:00:00.000Z",
              replayed: true
            },
            canOffer: false,
            offerBlockReason: "pending-allocation"
          })
        : templeState()
    })
  );
  await page.route("**/api/v1/offerings", async (route) => {
    keys.push(
      (route.request().postDataJSON() as { idempotencyKey: string })
        .idempotencyKey
    );
    if (keys.length === 1) {
      await route.fulfill({ status: 503 });
      return;
    }
    settled = true;
    await route.fulfill({
      json: {
        offeringId: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
        resultType: "blessing",
        offeredTokens: "30",
        agentTokens: { claudeCode: "10", codex: "20" },
        awardedPoints: 2,
        createdAt: "2026-07-23T06:00:00.000Z",
        cooldownEndsAt: "2026-07-23T18:00:00.000Z",
        replayed: true
      }
    });
  });

  await page.goto("/en");
  await page.getByRole("button", { name: "Offer Tokens" }).click();
  const dialog = page.getByRole("dialog", { name: "Offer all Eligible Tokens?" });
  await dialog.getByRole("button", { name: "Offer Tokens" }).click();
  await expect(dialog.getByRole("alert")).toContainText("result is uncertain");
  await dialog.getByRole("button", { name: "Offer Tokens" }).click();

  await expect(
    page.getByRole("status", { name: "The Goddess is revealing your fate." })
  ).toBeVisible();
  await expect(page.locator(".temple-content")).toHaveClass(/is-dimmed/);
  await expect(page.getByRole("status").filter({ hasText: "Blessing" })).toBeVisible({
    timeout: 3000
  });
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});

test("a competing tab result is restored after this tab loses the settlement race", async ({
  page
}) => {
  let raceLost = false;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "active", character } })
  );
  await page.route("**/api/v1/temple/sync-state", (route) => {
    return route.fulfill({
      json:
        !raceLost
          ? templeState()
          : templeState({
              eligibleTokens: "0",
              cooldownEndsAt: "2026-07-23T18:00:00.000Z",
              pendingOffering: {
                offeringId: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
                resultType: "blessing",
                offeredTokens: "30",
                agentTokens: { claudeCode: "10", codex: "20" },
                awardedPoints: 2,
                createdAt: "2026-07-23T06:00:00.000Z",
                cooldownEndsAt: "2026-07-23T18:00:00.000Z",
                replayed: true
              },
              canOffer: false,
              offerBlockReason: "pending-allocation"
            })
    });
  });
  await page.route("**/api/v1/offerings", (route) => {
    raceLost = true;
    return route.fulfill({
      status: 409,
      json: { code: "OFFERING_PENDING_ALLOCATION" }
    });
  });

  await page.goto("/en");
  await page.getByRole("button", { name: "Offer Tokens" }).click();
  const dialog = page.getByRole("dialog", { name: "Offer all Eligible Tokens?" });
  await dialog.getByRole("button", { name: "Offer Tokens" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Blessing");
  await expect(page.getByRole("status")).toContainText("30");
});

test("a replay already allocated on another device restores the current character", async ({
  page
}) => {
  let settledElsewhere = false;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "active", character } })
  );
  await page.route("**/api/v1/temple/sync-state", (route) =>
    route.fulfill({
      json: settledElsewhere
        ? templeState({
            character: {
              ...character,
              attributes: { ...character.attributes, courage: 4 }
            },
            eligibleTokens: "0",
            cooldownEndsAt: "2026-07-23T18:00:00.000Z",
            canOffer: false,
            offerBlockReason: "cooldown"
          })
        : templeState()
    })
  );
  await page.route("**/api/v1/offerings", (route) => {
    settledElsewhere = true;
    return route.fulfill({
      json: {
        offeringId: "7af5d120-0215-4ae6-85f5-1dc47658ef1e",
        resultType: "blessing",
        offeredTokens: "30",
        agentTokens: { claudeCode: "10", codex: "20" },
        awardedPoints: 2,
        createdAt: "2026-07-23T06:00:00.000Z",
        cooldownEndsAt: "2026-07-23T18:00:00.000Z",
        replayed: true
      }
    });
  });

  await page.goto("/en");
  await page.getByRole("button", { name: "Offer Tokens" }).click();
  const dialog = page.getByRole("dialog", { name: "Offer all Eligible Tokens?" });
  await dialog.getByRole("button", { name: "Offer Tokens" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Blessing" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Courage" })).toContainText("4");
  await expect(page.getByRole("button", { name: "Offer Tokens" })).toBeDisabled();
});

test("the authoritative state refreshes when cooldown naturally expires", async ({
  page
}) => {
  let stateRequests = 0;
  let readyAt = 0;
  const serverNow = new Date("2026-07-23T06:00:00.000Z");
  const cooldownEndsAt = new Date(serverNow.getTime() + 500).toISOString();
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "active", character } })
  );
  await page.route("**/api/v1/temple/sync-state", (route) => {
    stateRequests += 1;
    readyAt ||= Date.now() + 1500;
    return route.fulfill({
      json:
        Date.now() < readyAt
          ? templeState({
              serverNow: serverNow.toISOString(),
              cooldownEndsAt,
              canOffer: false,
              offerBlockReason: "cooldown"
            })
          : templeState({
              serverNow: new Date(serverNow.getTime() + 2000).toISOString(),
              cooldownEndsAt
            })
    });
  });

  await page.goto("/en");
  const offer = page.getByRole("button", { name: "Offer Tokens" });
  await expect(offer).toBeDisabled();
  await expect(offer).toBeEnabled({ timeout: 4000 });
  expect(stateRequests).toBeGreaterThanOrEqual(2);
  const requestsAfterReady = stateRequests;
  await page.waitForTimeout(150);
  expect(stateRequests).toBe(requestsAfterReady);
});

test("the main Offering button keeps its label while authoritative blockers change", async ({
  page
}) => {
  let block:
    | "collector"
    | "tokens"
    | "cooldown" = "collector";
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "active", character } })
  );
  await page.route("**/api/v1/temple/sync-state", (route) => {
    const overrides =
      block === "collector"
        ? {
            collector: {
              connected: false,
              lastSuccessfulSyncAt: null,
              stale: false
            }
          }
        : block === "tokens"
          ? { eligibleTokens: "0" }
          : {
              cooldownEndsAt: "2026-07-23T18:00:00.000Z",
              serverNow: "2026-07-23T06:00:00.000Z"
            };
    return route.fulfill({
      json: templeState({
        ...overrides,
        canOffer: false,
        offerBlockReason: block
      })
    });
  });

  await page.goto("/en");
  const offer = page.getByRole("button", { name: "Offer Tokens" });
  await expect(offer).toBeDisabled();
  await expect(page.getByText("Connect a Collector before your first Offering.")).toBeVisible();

  block = "tokens";
  await page.reload();
  await expect(offer).toBeDisabled();
  await expect(page.getByText("Sync new Eligible Tokens before another Offering.")).toBeVisible();

  block = "cooldown";
  await page.reload();
  await expect(offer).toBeDisabled();
  await expect(page.getByText("Cooldown is active.")).toBeVisible();
  await expect(page.getByText(/^(12:00:00|11:59:5\d)$/)).toBeVisible();
});

function templeState(overrides: Record<string, unknown> = {}) {
  return {
    character,
    aggregates: {
      totalTokensOffered: "0",
      agentTokensOffered: { claudeCode: "0", codex: "0" },
      offeringCount: 0,
      rankEligible: false,
      attainedAt: {
        totalTokens: null,
        courage: "2026-07-22T06:00:00.000Z",
        strength: "2026-07-22T06:00:00.000Z",
        wisdom: "2026-07-22T06:00:00.000Z",
        faith: "2026-07-22T06:00:00.000Z"
      }
    },
    collector: {
      connected: true,
      lastSuccessfulSyncAt: "2026-07-23T05:55:00.000Z",
      stale: false
    },
    eligibleTokens: "30",
    serverNow: "2026-07-23T06:00:00.000Z",
    cooldownEndsAt: null,
    pendingOffering: null,
    canOffer: true,
    offerBlockReason: null,
    ...overrides
  };
}
