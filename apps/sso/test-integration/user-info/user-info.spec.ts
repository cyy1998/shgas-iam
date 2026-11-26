// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode, OrganizationType } from "@iam/contracts";
import { ClientDelegationStatus } from "@iam/delegation/wire";
import { expect, test } from "@playwright/test";
import { delegationRecord } from "../../test/mocks/delegation";
import { currentUserInfo } from "../../test/mocks/fixtures";
import { mockSsoApi } from "../fixtures";

test("pauses an outgoing delegation and refreshes the list through the personal endpoints", async ({ page }) => {
  await mockSsoApi(page);
  await page.route("**/api/iam/sso/user-info", (route) =>
    route.fulfill({ json: { code: 200, data: currentUserInfo } }),
  );
  let record = { ...delegationRecord, status: ClientDelegationStatus.Enable };
  await page.route("**/api/iam/delegations/search", (route) => route.fulfill({ json: { code: 200, data: [record] } }));
  await page.route("**/api/iam/delegations/42", (route) => {
    record = { ...record, status: ClientDelegationStatus.Pause };
    return route.fulfill({ json: { code: 200, data: { changed: true, result: record } } });
  });

  await page.goto("/portal/userInfo");
  await page.getByRole("tab", { name: "委托设置" }).click();
  await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();

  const patch = page.waitForRequest("**/api/iam/delegations/42");
  const search = page.waitForRequest("**/api/iam/delegations/search");
  await page.getByRole("button", { name: "暂停" }).click();
  const [updateRequest, searchRequest] = await Promise.all([patch, search]);
  expect(updateRequest.method()).toBe("PATCH");
  expect(updateRequest.postDataJSON()).toEqual({ status: ClientDelegationStatus.Pause });
  expect(searchRequest.method()).toBe("POST");
  expect(searchRequest.postDataJSON()).toEqual({ direction: "outgoing" });
  for (const request of [updateRequest, searchRequest]) {
    const client = await request.headerValue("client");
    expect(client).toBe("iam");
  }
  await expect(page.getByRole("button", { name: "恢复" })).toBeVisible();
});

test("mobile binding guides recovery from a missing response and from a spent code", async ({ page }) => {
  await mockSsoApi(page);
  await page.route("**/api/iam/sso/user-info", (route) =>
    route.fulfill({ json: { code: 200, data: currentUserInfo } }),
  );
  let attempts = 0;
  await page.route("**/api/iam/auth/account/mobile", (route) => {
    attempts++;
    if (attempts === 1) return route.abort("timedout");
    if (attempts === 2) {
      return route.fulfill({ status: 400, json: { code: ApiErrorCode.InvalidVerificationCode, data: null } });
    }
    return route.fulfill({ json: { code: 200, data: null } });
  });

  await page.goto("/portal/userInfo");
  await page.getByRole("tab", { name: /绑定手机号/ }).click();
  await page.getByPlaceholder("请输入手机号").fill("13900000001");
  await page.getByPlaceholder("请输入验证码").fill("123456");
  const submit = page.getByRole("button", { name: "保存设置" });
  await submit.click();
  await expect(page.getByText(/请先确认变更是否已生效.*重新获取验证码/)).toBeVisible();
  expect(attempts).toBe(1);

  await submit.click();
  await expect(page.getByText("验证码无效，请检查输入，或重新获取验证码。")).toBeVisible();
  await expect(page.getByRole("button", { name: "获取验证码" })).toBeEnabled();
  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByPlaceholder("请输入验证码").fill("234567");
  await submit.click();
  await expect(page.getByText("更换成功！")).toBeVisible();
});

test("a malformed shared organization path stays unavailable until a valid projection is retried", async ({ page }) => {
  await mockSsoApi(page);
  let requests = 0;
  await page.route("**/api/iam/sso/user-info", (route) => {
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
  await page.route("**/api/iam/sso/user-info", (route) =>
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
  await page.route("**/api/iam/sso/user-info", (route) =>
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
