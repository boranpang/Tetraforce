import { expect, test } from "@playwright/test";

const restoredCharacter = {
  id: "94606318-e25f-4dee-ab13-ee58b1747aa0",
  gameName: "ServerHero",
  attributes: { courage: 2, strength: 3, wisdom: 4, faith: 5 }
};

test("a failed OAuth callback returns to the Temple with visible recovery text", async ({
  page
}) => {
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "anonymous" } })
  );

  await page.goto("/en?binding=error");
  await expect(
    page.getByRole("alert").filter({ hasText: "GitHub connection failed. Try connecting again." })
  ).toBeVisible();
});

test("a completed Guest Character can start GitHub OAuth without changing the Offering button", async ({
  page
}) => {
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "anonymous" } })
  );

  await page.goto("/en");
  const couragePlus = page.getByRole("button", { name: "Courage +1" });
  for (let point = 0; point < 4; point += 1) {
    await couragePlus.click();
  }
  await page.getByRole("button", { name: "Accept Your Fate" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Seal My Fate" }).click();

  await expect(page.getByRole("button", { name: "Offer Tokens" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveAttribute(
    "href",
    "/api/v1/auth/github?locale=en"
  );
});

test("a new GitHub identity completes Game Name and consent in one binding step", async ({
  page
}) => {
  let submittedBody: unknown;
  await page.route("**/api/v1/character/binding", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { status: "pending" } });
      return;
    }

    submittedBody = route.request().postDataJSON();
    await route.fulfill({
      json: {
        status: "active",
        created: true,
        character: {
          ...restoredCharacter,
          gameName: "Alice_12",
          attributes: { courage: 5, strength: 1, wisdom: 1, faith: 1 }
        }
      }
    });
  });

  await page.goto("/en");
  const couragePlus = page.getByRole("button", { name: "Courage +1" });
  for (let point = 0; point < 4; point += 1) {
    await couragePlus.click();
  }
  await page.getByRole("button", { name: "Accept Your Fate" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Seal My Fate" }).click();

  const binding = page.getByRole("region", { name: "Complete GitHub binding" });
  await expect(binding).toBeVisible();
  await expect(binding.getByText("Your persistent Character will be public.")).toBeVisible();
  await expect(binding.getByText("Your GitHub username and profile link stay private.")).toBeVisible();
  await binding.getByLabel("Game Name").fill("Ａｌｉｃｅ_１２");
  await binding.getByRole("checkbox", { name: /Terms effective July 22, 2026/ }).check();
  await binding.getByRole("checkbox", { name: /Privacy effective July 22, 2026/ }).check();
  await binding.getByRole("button", { name: "Create Character" }).click();

  await expect(page.getByRole("heading", { name: "Alice_12" })).toBeVisible();
  await expect(page.getByText("GitHub verified")).toBeVisible();
  expect(submittedBody).toEqual({
    gameName: "Ａｌｉｃｅ_１２",
    acceptedTerms: true,
    acceptedPrivacy: true
  });
});

test("an existing GitHub identity restores the server Character without loading a Guest Character", async ({
  page
}) => {
  let guestRequests = 0;
  await page.route("**/api/v1/character/binding", (route) =>
    route.fulfill({ json: { status: "active", character: restoredCharacter } })
  );
  await page.route("**/api/v1/guest", async (route) => {
    guestRequests += 1;
    await route.continue();
  });

  await page.goto("/zh");

  await expect(page.getByRole("heading", { name: "ServerHero" })).toBeVisible();
  await expect(page.getByText("GitHub 已验证")).toBeVisible();
  await expect(page.getByRole("button", { name: "角色页将在下一阶段开放" })).toBeVisible();
  await expect(page.getByRole("button", { name: "绑定 GitHub 后解锁角色页" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "信心" })).toContainText("5");
  expect(guestRequests).toBe(0);
});
