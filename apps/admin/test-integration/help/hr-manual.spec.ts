import { expect, test } from "@playwright/test";
import { hrAdminCapabilitySummary } from "../../test/mocks/fixtures";
import { mockAdminApi } from "../fixtures";

test("opens standalone help and preserves a shared chapter through reload and history", async ({ page }) => {
  await mockAdminApi(page, { capabilitySummary: hrAdminCapabilitySummary });
  await page.goto("/iam-admin/users");
  await page.locator("header").getByRole("link", { name: "使用帮助", exact: true }).click();
  await expect(page).toHaveURL(/\/help\/hr-admin$/);
  await expect(page.getByRole("menu")).toHaveCount(0);

  const contents = page.getByRole("navigation", { name: "说明书目录" });
  await contents.locator('a[href$="#transfer"]').click();
  await expect(page).toHaveURL(/#transfer$/);
  await page.getByRole("link", { name: "返回管理后台", exact: true }).click();
  await expect(page).toHaveURL(/\/iam-admin\/users$/);
  await expect(page.getByRole("menu")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#transfer$/);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(contents.locator('a[aria-current="page"]')).toHaveAttribute("href", /#transfer$/);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "说明书目录" }).locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    /#transfer$/,
  );
  await page.getByRole("navigation", { name: "说明书目录" }).locator('a[href$="#resignation"]').click();
  await page.goBack();
  await expect(page).toHaveURL(/#transfer$/);
  await expect(page.getByRole("navigation", { name: "说明书目录" }).locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    /#transfer$/,
  );

  const newPage = page.context().waitForEvent("page");
  await page.getByRole("article").locator('a[target="_blank"]').first().click();
  const operationPage = await newPage;
  await operationPage.waitForURL(/\/iam-admin\/employments$/);
  await operationPage.close();
  await expect(page).toHaveURL(/#transfer$/);
});

for (const capabilityState of ["empty", "unavailable"] as const) {
  test(`keeps help readable with ${capabilityState} management capabilities`, async ({ page }) => {
    await mockAdminApi(page, { capabilitySummary: { ...hrAdminCapabilitySummary, visibleModules: [] } });
    if (capabilityState === "unavailable") {
      await page.route("**/rpc/admin.authorization.capabilitySummary**", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", json: { error: "unavailable" } }),
      );
    }
    await page.goto("/iam-admin/help/hr-admin#organizations");
    const contents = page.getByRole("navigation", { name: "说明书目录" });
    await expect(contents.locator('a[aria-current="page"]')).toHaveAttribute("href", /#organizations$/);
    await contents.locator('a[href$="#users"]').click();
    await expect(page).toHaveURL(/#users$/);
    await page.reload();
    await expect(contents.locator('a[aria-current="page"]')).toHaveAttribute("href", /#users$/);
    await page.goto("/iam-admin/users");
    await expect(page).toHaveURL(/\/403$/);
  });
}
