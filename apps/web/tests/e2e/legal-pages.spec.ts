import { expect, test } from "@playwright/test";

test("English legal pages expose the required privacy, terms, and contact content", async ({
  page
}) => {
  await page.goto("/en/privacy");

  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage Summary upload allowlist" })).toBeVisible();
  await expect(page.getByTestId("usage-summary-field")).toHaveCount(9);
  await expect(page.getByText("Prompts, responses, code, tool calls, and commands", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public character fields" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Processors" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retention and deletion" })).toBeVisible();

  await page.getByRole("link", { name: "Terms" }).first().click();
  await expect(page).toHaveURL(/\/en\/terms$/);
  await expect(page.getByText("Tetraforce is an entertainment game", { exact: false })).toBeVisible();
  await expect(page.getByText("No Token, attribute, rank, or Offering has monetary value", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: "Contact" }).first().click();
  await expect(page).toHaveURL(/\/en\/contact$/);
  const supportLink = page.getByRole("link", { name: "support@tetraforce.example" });
  await expect(supportLink).toHaveAttribute("href", "mailto:support@tetraforce.example");
  await expect(page.getByRole("heading", { name: "Privacy requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Moderation review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security reports" })).toBeVisible();
});

test("Chinese legal copy switches locale on the same page and remains usable on mobile", async ({
  page
}) => {
  await page.goto("/zh/privacy");

  await expect(page.getByRole("heading", { name: "隐私说明" })).toBeVisible();
  await expect(page.getByTestId("usage-summary-field")).toHaveCount(9);

  const localeSwitch = page.getByRole("link", { name: "EN" });
  await localeSwitch.focus();
  await expect(localeSwitch).toBeFocused();
  expect(await localeSwitch.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/en\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("legal pages do not expose tracking or non-essential cookie UI", async ({ page }) => {
  await page.goto("/en/privacy");

  await expect(page.locator('script[src*="googletagmanager"], script[src*="posthog"], script[src*="hotjar"]')).toHaveCount(0);
  await expect(page.getByText(/cookie (banner|preferences)/i)).toHaveCount(0);
});
