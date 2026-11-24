import { expect, test } from "@playwright/test";
import { loginToAdmin, openClientSection } from "./src/admin-client-journey.ts";
import { requireEnvironment } from "./src/environment.ts";
import { installGatewayDns } from "./src/gateway-dns.ts";

test("production images serve the Admin sign-in and publish the seeded User Document through APISIX", async ({
  baseURL,
  page,
}) => {
  const origin = baseURL;
  if (!origin) throw new Error("Missing Container Smoke origin");
  const adminUsername = requireEnvironment("IAM_E2E_ADMIN_USERNAME");
  const adminPassword = requireEnvironment("IAM_E2E_ADMIN_PASSWORD");
  const internalApiKey = requireEnvironment("IAM_E2E_INTERNAL_API_KEY");
  const restoreDns = installGatewayDns();
  try {
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`/api/iam/internal/users/${adminUsername}`, {
            headers: { apikey: internalApiKey },
          });
          return response.ok() ? (await response.json()).data : { status: response.status() };
        },
        { timeout: 30_000 },
      )
      .toMatchObject({ username: adminUsername, subjectIdentifier: expect.any(String) });

    const [portal, ssoScript, adminScript] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/portal/login"),
      page.waitForResponse(
        (response) =>
          response.request().resourceType() === "script" &&
          new URL(response.url()).pathname.startsWith("/portal/assets/"),
      ),
      page.waitForResponse(
        (response) =>
          response.request().resourceType() === "script" &&
          new URL(response.url()).pathname.startsWith("/iam-admin/assets/"),
      ),
      loginToAdmin({ adminPassword, adminUsername, origin, page }),
    ]);
    expect(portal.ok()).toBe(true);
    expect(portal.headers()["content-type"]).toContain("text/html");
    for (const script of [ssoScript, adminScript]) {
      expect(script.ok()).toBe(true);
      expect(script.headers()["content-type"]).toMatch(/javascript/iu);
    }

    await openClientSection(page, "iam-admin", "basic");
    await expect(page).toHaveURL(/\/iam-admin\/clients\/iam-admin\/edit/u);
    for (const prefix of ["/portal", "/iam-admin"]) {
      const missing = await page.request.get(`${prefix}/assets/nonexistent.js`);
      expect(missing.status()).toBe(404);
    }
  } finally {
    restoreDns();
  }
});
