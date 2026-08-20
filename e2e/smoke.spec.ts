import { expect, test } from "@playwright/test";

test("critical local workflow configures data and imports a spreadsheet", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();
  await page.getByRole("link", { name: "إعداد المدرسة" }).first().click();
  await expect(page.getByRole("heading", { name: "إعداد المدرسة" })).toBeVisible();
  const thursdayPeriods = page.getByLabel("عدد حصص الخميس");
  await thursdayPeriods.fill("5");
  await expect(thursdayPeriods).toHaveValue("5");

  await page.getByRole("link", { name: "البيانات" }).click();
  await page.getByRole("button", { name: "إضافة صف" }).first().click();
  await page.getByLabel(/اسم الصف/).fill("الصف الأول");
  await page.getByLabel("ترتيب العرض").fill("1");
  await page.getByRole("button", { name: /^إضافة$/ }).click();
  await expect(page.getByText("الصف الأول")).toBeVisible();
  await page.getByRole("button", { name: "أرشفة الصف الأول" }).click();
  await expect(page.getByText("الصف الأول")).toBeHidden();
  await page.getByText("إظهار المؤرشف").click();
  await expect(page.getByText("الصف الأول")).toBeVisible();
  await page.getByRole("button", { name: "استعادة الصف الأول" }).click();
  await expect(page.getByText("الصف الأول")).toBeVisible();

  await page.getByRole("link", { name: "الاستيراد" }).click();
  await page.getByRole("button", { name: "تحميل نموذج تجريبي" }).click();
  await expect(page.getByText("التعيين مكتمل")).toBeVisible();
  await expect(page.getByText("صف مكرر").first()).toBeVisible();
  await page.getByRole("button", { name: "استيراد 3 صف" }).click();
  await expect(page.getByText("تم قبول 1 صف، وتسجيل 2 خطأ.")).toBeVisible();
});
