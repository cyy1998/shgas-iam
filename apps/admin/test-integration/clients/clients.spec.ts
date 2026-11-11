// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode } from "@iam/contracts";
import { expect, test } from "@playwright/test";
import { adminClientDetail } from "../../test/mocks/fixtures";
import { fulfillJson, fulfillTrpc, mockAdminApi, parseTrpcBatchInput } from "../fixtures";

test("client list has one edit entry leading to the unified editor", async ({ page }) => {
  await mockAdminApi(page);

  await page.goto("/iam-admin/clients");

  await expect(page.getByRole("link", { name: "编辑" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "SSO 启用" })).toHaveCount(0);

  await page.getByRole("link", { name: "编辑" }).click();
  await expect(page).toHaveURL(/\/iam-admin\/clients\/iam-admin\/edit\?section=basic$/);
});

test("creating a basic client opens its unified editor", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/iam-admin/clients");

  await page.getByRole("button", { name: /新建应用/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("新建应用")).toBeVisible();
  await dialog.getByLabel("应用编码").fill("portal cn");
  await dialog.getByLabel("应用名称").fill("门户");
  await dialog.getByLabel("通用应用密钥").fill("basic-secret");
  await dialog.getByRole("button", { name: "创建并编辑" }).click();

  await expect(page).toHaveURL(/\/iam-admin\/clients\/portal%20cn\/edit\?section=basic$/);
});

test("basic editor guards unsaved Internal API credentials across tabs and history", async ({ page }) => {
  await mockAdminApi(page);
  await page.route("**/rpc/admin.clientSso.detail**", (route) =>
    fulfillTrpc(route, {
      ...adminClientDetail,
      ssoConfig: null,
      allowedActions: { save: true, selectProtocol: true, setEnabled: true, rotateSecret: true, readSecret: true },
    }),
  );
  await page.goto("/iam-admin/clients");
  await page.getByRole("link", { name: "编辑" }).click();
  await page.getByLabel("通用应用密钥").fill("unsaved-secret");
  await page.getByRole("tab", { name: "SSO 配置" }).click();
  const confirmation = page.locator(".ant-modal-confirm-title").filter({ hasText: "放弃未保存的修改？" });
  await expect(confirmation).toBeVisible();
  await page.getByRole("button", { name: /取\s*消/ }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page).toHaveURL(/section=basic$/);
  await expect(page.getByLabel("通用应用密钥")).toHaveValue("unsaved-secret");
  await page.getByRole("tab", { name: "SSO 配置" }).click();
  await expect(confirmation).toBeVisible();
  await page.getByRole("button", { name: "放弃修改" }).click();
  await expect(page).toHaveURL(/section=sso$/);
  await page.getByRole("tab", { name: "基础信息" }).click();
  await expect(page.getByLabel("通用应用密钥")).toHaveValue(adminClientDetail.clientSecret);
  await page.getByLabel("通用应用密钥").fill("another-unsaved-secret");
  await page.evaluate(() => window.history.back());
  await expect(confirmation).toBeVisible();
  await page.getByRole("button", { name: "放弃修改" }).click();
  await expect(page).toHaveURL(/section=sso$/);
  await page.getByRole("button", { name: /返回应用列表/ }).click();
  await expect(page).toHaveURL(/clients$/);
  await page.getByRole("link", { name: "编辑" }).click();
  await expect(page.getByLabel("通用应用密钥")).toHaveValue(adminClientDetail.clientSecret);
});

test("canceling cross-document back navigation preserves the Internal API credential draft", async ({ page }) => {
  await mockAdminApi(page);
  const editPath = "/iam-admin/clients/iam-admin/edit?section=basic";
  await page.goto("/iam-admin/clients");
  await page.goto(editPath);

  const secret = page.getByLabel("通用应用密钥");
  await secret.click();
  await secret.fill("unsaved-secret");

  const confirmation = page.waitForEvent("dialog", { timeout: 10_000 }).then(async (dialog) => {
    await dialog.dismiss();
    return dialog.type();
  });
  const [dialogType] = await Promise.all([confirmation, page.evaluate(() => window.history.back())]);

  expect(dialogType).toBe("beforeunload");
  await expect(page).toHaveURL(editPath);
  await expect(secret).toHaveValue("unsaved-secret");
});

test("unknown section falls back to basic and delete returns to list", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/iam-admin/clients/iam-admin/edit?section=unknown");

  await expect(page).toHaveURL(/section=basic$/);
  await expect(page.getByRole("tab", { name: "基础信息" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "删除应用" }).click();
  await expect(page.locator(".ant-modal-confirm-title").filter({ hasText: "删除应用 IAM 管理后台？" })).toBeVisible();
  await page.getByRole("button", { name: /确\s*定/ }).click();
  await expect(page).toHaveURL(/\/iam-admin\/clients$/);
});

test("client create committed failure refreshes facts and retains repair warning", async ({ page }) => {
  await mockAdminApi(page);
  let mutations = 0;
  let reads = 0;
  await page.unroute("**/rpc/admin.client.detail**");
  await page.route("**/rpc/admin.client.detail**", (route) => {
    reads += 1;
    const detailInput = parseTrpcBatchInput<{ clientCode: string }>(route);
    expect(detailInput.clientCode).toBe("new-client");
    return fulfillTrpc(route, {
      ...adminClientDetail,
      clientName: mutations ? "已提交的应用" : adminClientDetail.clientName,
    });
  });
  await page.unroute("**/rpc/admin.client.create**");
  await page.route("**/rpc/admin.client.create**", (route) => {
    mutations += 1;
    return fulfillJson(route, [
      {
        error: {
          message: "required invalidation failed",
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            serviceCode: ApiErrorCode.AdminMutationCommitted,
          },
        },
      },
    ]);
  });
  await page.goto("/iam-admin/clients");
  await page.getByRole("button", { name: /新建应用/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("应用编码").fill("new-client");
  await dialog.getByLabel("应用名称").fill("新应用");
  await dialog.getByLabel("通用应用密钥").fill("secret");
  await dialog.getByRole("button", { name: "创建并编辑" }).click();
  await expect(page).toHaveURL(/clients\/new-client\/edit\?section=basic&committed=1$/);
  await expect(page.getByText("已提交的应用", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("详情可读不代表传播已恢复");
  expect(reads).toBe(1);
  expect(mutations).toBe(1);
});
