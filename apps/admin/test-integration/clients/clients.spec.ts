// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode, ClientSsoProtocol } from "@iam/contracts";
import { expect, test } from "@playwright/test";
import { adminClientDetail, adminClientSearchResult } from "../../test/mocks/fixtures";
import { fulfillJson, fulfillTrpc, mockAdminApi, parseTrpcBatchInput } from "../fixtures";

test("client list has one edit entry leading to the unified editor", async ({ page }) => {
  await mockAdminApi(page);

  await page.goto("/iam-admin/clients");

  await expect(page.getByRole("link", { name: "编辑" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "SSO 启用" })).toHaveCount(0);

  await page.getByRole("link", { name: "编辑" }).click();
  await expect(page).toHaveURL(/\/iam-admin\/clients\/iam-admin\/edit\?section=basic$/);
});

test("client list applies structured single protocol and enable filters", async ({ page }) => {
  await mockAdminApi(page);
  await page.unroute("**/rpc/admin.client.search**");
  type ClientSearchInput = {
    conditions?: {
      exactConditions?: {
        ssoProtocols?: ClientSsoProtocol[];
        ssoEnabled?: boolean;
      };
    };
  };
  const searchInputs: ClientSearchInput[] = [];
  await page.route("**/rpc/admin.client.search**", (route) => {
    const input = parseTrpcBatchInput<ClientSearchInput>(route);
    searchInputs.push(input);
    const exactConditions = input.conditions?.exactConditions;
    const matches =
      JSON.stringify(exactConditions?.ssoProtocols) === JSON.stringify([ClientSsoProtocol.CustomSso]) &&
      JSON.stringify(exactConditions?.ssoEnabled) === JSON.stringify(false);
    return fulfillTrpc(route, matches ? adminClientSearchResult : { result: [], total: 0 });
  });

  await page.goto("/iam-admin/clients");
  await page.getByText("展开", { exact: true }).click();
  await page.getByLabel("SSO 协议", { exact: true }).click();
  await page.locator(".ant-select-dropdown:visible").getByText("Custom SSO", { exact: true }).click();
  await page.getByLabel("SSO 启用", { exact: true }).click();
  await page.locator(".ant-select-dropdown:visible").getByText("已停用", { exact: true }).click();
  await page.getByRole("button", { name: /查\s*询/ }).click();

  await expect
    .poll(() => searchInputs.at(-1))
    .toMatchObject({
      conditions: {
        exactConditions: {
          ssoProtocols: [ClientSsoProtocol.CustomSso],
          ssoEnabled: false,
        },
      },
    });
  await expect(page.getByText("IAM 管理后台", { exact: true })).toBeVisible();
  await expect(page.getByText("已停用", { exact: true }).first()).toBeVisible();
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

test("unified editor exposes loading, not-found and error states", async ({ page }) => {
  await mockAdminApi(page);
  let releaseDetail!: () => void;
  const detailGate = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  await page.route("**/rpc/admin.client.detail**", async (route) => {
    await detailGate;
    await fulfillTrpc(route, adminClientDetail);
  });

  await page.goto("/iam-admin/clients/iam-admin/edit?section=basic");
  await expect(page.getByTestId("client-edit-loading")).toBeVisible();
  releaseDetail();
  await expect(page.getByRole("tab", { name: "基础信息" })).toBeVisible();

  await page.unroute("**/rpc/admin.client.detail**");
  await page.route("**/rpc/admin.client.detail**", (route) =>
    fulfillJson(route, [
      {
        error: {
          message: "client not found",
          code: -32004,
          data: {
            code: "NOT_FOUND",
            httpStatus: 404,
            path: "admin.client.detail",
            serviceCode: "CLIENT_NOT_FOUND",
          },
        },
      },
    ]),
  );
  await page.goto("/iam-admin/clients/missing/edit?section=basic");
  await expect(page.getByText("应用不存在")).toBeVisible();

  await page.unroute("**/rpc/admin.client.detail**");
  await page.route("**/rpc/admin.client.detail**", (route) =>
    fulfillJson(route, [
      {
        error: {
          message: "internal",
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
            path: "admin.client.detail",
          },
        },
      },
    ]),
  );
  await page.goto("/iam-admin/clients/broken/edit?section=basic");
  await expect(page.getByText("应用详情加载失败")).toBeVisible();
});

for (const operation of ["update", "delete", "create"] as const) {
  test(`client ${operation} committed failure refreshes facts and retains repair warning`, async ({ page }) => {
    await mockAdminApi(page);
    let mutations = 0;
    let reads = 0;
    await page.unroute("**/rpc/admin.client.detail**");
    await page.route("**/rpc/admin.client.detail**", (route) => {
      reads += 1;
      const detailInput = parseTrpcBatchInput<{ clientCode: string }>(route);
      expect(detailInput.clientCode).toBe(operation === "create" ? "new-client" : "iam-admin");
      if (operation === "delete" && mutations) {
        return fulfillJson(route, [
          {
            error: {
              message: "not found",
              code: -32004,
              data: {
                code: "NOT_FOUND",
                httpStatus: 404,
                serviceCode: ApiErrorCode.ClientNotFound,
              },
            },
          },
        ]);
      }
      return fulfillTrpc(route, {
        ...adminClientDetail,
        clientName: mutations ? "已提交的应用" : adminClientDetail.clientName,
      });
    });
    await page.unroute(`**/rpc/admin.client.${operation}**`);
    await page.route(`**/rpc/admin.client.${operation}**`, (route) => {
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
    if (operation === "create") {
      await page.goto("/iam-admin/clients");
      await page.getByRole("button", { name: /新建应用/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("应用编码").fill("new-client");
      await dialog.getByLabel("应用名称").fill("新应用");
      await dialog.getByLabel("通用应用密钥").fill("secret");
      await dialog.getByRole("button", { name: "创建并编辑" }).click();
      await expect(page).toHaveURL(/clients\/new-client\/edit\?section=basic&committed=1$/);
    } else {
      await page.goto("/iam-admin/clients/iam-admin/edit?section=basic");
      if (operation === "update") await page.getByRole("button", { name: "保存基础信息" }).click();
      if (operation === "delete") {
        await page.getByRole("button", { name: "删除应用" }).click();
        await page.getByRole("button", { name: /确\s*定/ }).click();
      }
    }
    await expect(
      page.getByText(operation === "delete" ? "应用不存在" : "已提交的应用", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("详情可读不代表传播已恢复");
    expect(reads).toBe(operation === "create" ? 1 : 2);
    expect(mutations).toBe(1);
  });
}
