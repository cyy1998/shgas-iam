// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode, OrganizationType } from "@iam/contracts";
import { expect, test } from "@playwright/test";
import { currentUserInfo } from "../../test/mocks/fixtures";
import { mockSsoApi } from "../fixtures";

test("a malformed shared organization path stays unavailable until a valid projection is retried", async ({ page }) => {
  await mockSsoApi(page);
  let requests = 0;
  await page.route("**/public/user-info", (route) => {
    requests += 1;
    return route.fulfill({
      json: {
        code: 200,
        message: "OK",
        data: {
          ...currentUserInfo,
          profile: {
            ...currentUserInfo.profile,
            employments: [
              {
                isPrimary: true,
                organization: {
                  code: "FIN",
                  name: "财务部",
                  type: OrganizationType.Department,
                  path: [
                    { code: "ROOT", name: "总部", type: OrganizationType.Company, level: 1, distanceToTarget: 1 },
                    {
                      code: "FIN",
                      name: "财务部",
                      type: OrganizationType.Department,
                      level: requests === 1 ? 1 : 2,
                      distanceToTarget: 0,
                    },
                  ],
                },
                position: { code: "FIN-1", name: "会计" },
                responsibilities: [],
              },
            ],
          },
        },
      },
    });
  });

  await page.goto("/portal/userInfo");
  await expect(page.getByRole("alert")).toContainText("个人信息加载失败");
  await expect(page.getByRole("button", { name: /保存设置/ })).toHaveCount(0);
  expect(requests).toBe(1);
  await page.getByRole("button", { name: /重\s*试/ }).click();
  await expect(page.getByRole("button", { name: /保存设置/ })).toBeVisible();
  await expect(page.getByText("总部 / 财务部", { exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test("portal logout uses the current entry and preserves the configured business destination", async ({ page }) => {
  await mockSsoApi(page);
  await page.route("**/public/user-info", (route) =>
    route.fulfill({
      json: { code: 200, message: "OK", data: currentUserInfo },
    }),
  );
  await page.route("**/sso/.well-known/authentication-configuration", async (route) => {
    const origin = new URL(route.request().url()).origin;
    await route.fulfill({
      json: {
        data: {
          authorizationEndpoint: `${origin}/sso/authorize`,
          logoutEndpoint: `${origin}/sso/logout`,
        },
      },
    });
  });
  await page.route("**/sso/logout?**", (route) => route.fulfill({ body: "<p>Logged out</p>" }));
  const redirectUrl = "https://business.example/after-logout?keep=yes";
  await page.goto(`/portal/userInfo?${new URLSearchParams({ client: "iam", redirectUrl })}`);
  const origin = new URL(page.url()).origin;
  await page.locator(".topbar-user").hover();
  await page.getByText("退出登录", { exact: true }).click();
  await page.waitForURL("**/sso/logout?**");
  const logout = new URL(page.url());
  expect(logout.origin).toBe(origin);
  expect(logout.searchParams.get("redirectUrl")).toBe(redirectUrl);
  expect(logout.searchParams.get("client")).toBe("iam");
});

test("anonymous user info entry starts the SSO login flow", async ({ page }) => {
  await mockSsoApi(page);
  await page.route("**/public/user-info", (route) =>
    route.fulfill({
      contentType: "application/json",
      json: {
        code: ApiErrorCode.Unauthorized,
        message: "未登录",
        data: null,
      },
      status: 401,
    }),
  );

  await page.goto("/portal/userInfo");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/portal/login");

  const loginUrl = new URL(page.url());
  expect(loginUrl.searchParams.get("client")).toBe("iam");
  expect(loginUrl.searchParams.get("redirectUrl")).toBe("http://127.0.0.1:8000/portal/userInfo");
});
