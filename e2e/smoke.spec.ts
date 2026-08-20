import { expect, test } from "@playwright/test";

test("navigates through the phase one shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();
  await page.getByRole("link", { name: "إعداد المدرسة" }).first().click();
  await expect(page.getByRole("heading", { name: "إعداد المدرسة" })).toBeVisible();
  const thursdayPeriods = page.getByLabel("عدد حصص الخميس");
  await thursdayPeriods.fill("5");
  await expect(thursdayPeriods).toHaveValue("5");
});
