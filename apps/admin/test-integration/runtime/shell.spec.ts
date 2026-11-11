// Browser Integration uses a mocked backend; this is not a full-system journey.
import { expect, test } from "@playwright/test";
import { fulfillTrpc, mockAdminApi } from "../fixtures";

test("an unknown Admin route redirects to the forbidden page", async ({ page }) => {
  await mockAdminApi(page);

  await page.goto("/iam-admin/unknown");

  await expect(page).toHaveURL("/iam-admin/403");
});

test("a role without Admin capability is default-denied before management requests", async ({ page }) => {
  let clientRequestCount = 0;
  await mockAdminApi(page, {
    capabilitySummary: {
      visibleModules: [],
      collectionActions: {
        delegation: { create: { allowed: false, reason: "ACTION_NOT_GRANTED" } },
        user: { create: { allowed: false, reason: "ACTION_NOT_GRANTED" } },
        employment: {
          create: { allowed: false, reason: "ACTION_NOT_GRANTED" },
        },
        organization: {
          createRoot: { allowed: false, reason: "ACTION_NOT_GRANTED" },
        },
        organizationResponsibility: {
          create: { allowed: false, reason: "ACTION_NOT_GRANTED" },
        },
        position: {
          create: { allowed: false, reason: "ACTION_NOT_GRANTED" },
          edit: { allowed: false, reason: "ACTION_NOT_GRANTED" },
          changeStatus: { allowed: false, reason: "ACTION_NOT_GRANTED" },
          delete: { allowed: false, reason: "ACTION_NOT_GRANTED" },
        },
      },
    },
  });
  await page.route("**/rpc/admin.client.search**", (route) => {
    clientRequestCount += 1;
    return route.abort();
  });

  await page.goto("/iam-admin/clients");

  await expect(page).toHaveURL(/\/iam-admin\/403$/);
  await expect(page.getByText("无访问权限")).toBeVisible();
  expect(clientRequestCount).toBe(0);
});

test("restores a trusted callback query and hash before the admin shell renders", async ({ page }) => {
  await mockAdminApi(page);
  const callbackUrl = new URL("/iam-admin/users", "http://127.0.0.1:8001");
  callbackUrl.searchParams.set("token", "local-session");
  callbackUrl.searchParams.set("state", "iam-first-party-navigation:v1:?tab=enabled#details");

  await page.goto(callbackUrl.toString());

  await expect(page.getByText("用户管理").first()).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe("?tab=enabled");
  expect(new URL(page.url()).hash).toBe("#details");
});

test("a failed capability read keeps management requests blocked during and after initialization", async ({ page }) => {
  await mockAdminApi(page);
  let finishCapabilities!: () => void;
  const capabilityGate = new Promise<void>((resolve) => {
    finishCapabilities = resolve;
  });
  await page.route("**/rpc/admin.authorization.capabilitySummary**", async (route) => {
    await capabilityGate;
    await route.fulfill({ status: 503, contentType: "application/json", json: { error: "unavailable" } });
  });
  let clientRequestCount = 0;
  await page.route("**/rpc/admin.client.search**", (route) => {
    clientRequestCount += 1;
    return route.abort();
  });

  const capabilitiesRequested = page.waitForRequest("**/rpc/admin.authorization.capabilitySummary**");
  try {
    await page.goto("/iam-admin/clients");
    await capabilitiesRequested;
    await expect(page).toHaveURL(/\/iam-admin\/clients$/);
    expect(clientRequestCount).toBe(0);
  } finally {
    finishCapabilities();
  }
  await expect(page).toHaveURL(/\/iam-admin\/403$/);
  expect(clientRequestCount).toBe(0);
});

test("an unauthenticated entry sends its path, query and hash to SSO", async ({ page, baseURL }) => {
  await mockAdminApi(page);
  await page.route("**/public/user-info", (route) => route.fulfill({ status: 401 }));
  await page.route("**/sso/authorize?**", (route) => route.fulfill({ body: "SSO" }));

  await page.goto("/iam-admin/users?tab=enabled#details");

  await expect(page).toHaveURL(/\/sso\/authorize\?/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("client")).toBe("iam-admin");
  expect(params.get("redirectUrl")).toBe(`${baseURL}/iam-admin/users`);
  expect(params.get("state")).toBe("iam-first-party-navigation:v1:?tab=enabled#details");
});

test("an incomplete capability response does not open a protected page", async ({ page }) => {
  await mockAdminApi(page);
  await page.route("**/rpc/admin.authorization.capabilitySummary**", (route) =>
    fulfillTrpc(route, { visibleModules: ["client"] }),
  );

  await page.goto("/iam-admin/clients");

  await expect(page).toHaveURL(/\/iam-admin\/403$/, { timeout: 10_000 });
});
