import { expect, test } from "@playwright/test";

test("a first-time English visitor receives a temporary character and four points", async ({
  context,
  page
}) => {
  await page.goto("/en");

  await expect(page.getByRole("heading", { name: "Tetraforce" })).toBeVisible();
  await expect(page.getByText(/^[A-Z][A-Za-z]+-\d{3}$/)).toBeVisible();
  await expect(page.getByText("4 points remaining")).toBeVisible();

  for (const name of ["Courage", "Strength", "Wisdom", "Faith"]) {
    await expect(page.getByRole("group", { name })).toContainText("1");
  }

  await expect(page.getByRole("button", { name: "Accept Your Fate" })).toBeDisabled();
  const characterLock = page.getByRole("button", {
    name: "Connect GitHub to unlock Character"
  });
  await expect(characterLock).toBeVisible();
  await expect(characterLock).toContainText("Connect GitHub to unlock Character");

  const guestCookie = (await context.cookies()).find(({ name }) => name === "tetraforce_guest");
  expect(guestCookie?.expires ?? -1).toBeGreaterThan(Date.now() / 1000);
});

test("a visitor can revise, confirm, and keep one final allocation", async ({ page }) => {
  await page.goto("/en");

  const couragePlus = page.getByRole("button", { name: "Courage +1" });
  const courageMinus = page.getByRole("button", { name: "Courage -1" });
  const accept = page.getByRole("button", { name: "Accept Your Fate" });

  await couragePlus.click();
  await couragePlus.click();
  await courageMinus.click();
  await expect(page.getByText("3 points remaining")).toBeVisible();
  await expect(accept).toBeDisabled();

  await couragePlus.click();
  await couragePlus.click();
  await couragePlus.click();
  await expect(page.getByText("0 points remaining")).toBeVisible();
  await expect(accept).toBeEnabled();

  await accept.click();
  const dialog = page.getByRole("dialog", { name: "Seal your fate?" });
  await expect(dialog).toContainText("irreversible");
  await expect(dialog.getByRole("button", { name: "Go Back" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await accept.click();
  await page.getByRole("dialog").getByRole("button", { name: "Seal My Fate" }).click();
  await expect(page.getByText("Your fate is sealed.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Courage" })).toContainText("5");
  await expect(page.getByRole("button", { name: "Offer Tokens" })).toBeDisabled();

  await page.reload();
  await expect(page.getByText("Your fate is sealed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept Your Fate" })).toHaveCount(0);
});

test("the API rejects a modified signed guest cookie", async ({ context, page }) => {
  await page.goto("/en");
  await expect(page.getByText(/^[A-Z][A-Za-z]+-\d{3}$/)).toBeVisible();
  const cookie = (await context.cookies()).find(({ name }) => name === "tetraforce_guest");
  if (!cookie) {
    throw new Error("Expected the guest cookie to exist.");
  }

  await context.addCookies([{ ...cookie, value: `${cookie.value}x` }]);
  const response = await page.request.get("/api/v1/guest");

  expect(response.status()).toBe(400);
});

test("the Chinese flow fits mobile and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh");

  await expect(page.getByText("剩余 4 点")).toBeVisible();
  const characterLock = page.getByRole("button", { name: "绑定 GitHub 后解锁角色页" });
  await expect(characterLock).toBeVisible();
  await expect(characterLock).toContainText("绑定 GitHub 后解锁角色页");

  const firstPlus = page.getByRole("button", { name: "勇气 +1" });
  await firstPlus.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("剩余 3 点")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  const animationName = await page.locator(".goddess-sigil span").evaluate(
    (element) => getComputedStyle(element).animationName
  );

  expect(hasHorizontalOverflow).toBe(false);
  expect(animationName).toBe("none");
});
