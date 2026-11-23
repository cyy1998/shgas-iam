import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { UserDocumentSchema } from "@iam/contracts";
import type { CustomAttributeValues } from "@iam/contracts/custom-attributes";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import type { APIResponse } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  formatResourceFailure,
  type ManagedResourceRun,
  readManagedResourceRun,
  runManagedComposeCommand,
} from "../../scripts/test-resources/managed-resources.mjs";
import { loginToAdmin } from "./src/admin-client-journey.ts";
import { requireEnvironment } from "./src/environment.ts";
import { test as gatewayTest } from "./src/gateway-test.ts";
import { createPkceS256Pair, receiveOidcAuthorizationCallback } from "./src/oidc-rp.ts";
import { assertExactProject } from "./src/recovery.ts";

const publicationTimeoutMs = 45_000;
const composeCommandTimeoutMs = 30_000;
const definitionPath = "/api/iam/admin/custom-attribute-definitions";
const attributes = [
  { entityType: "user", code: "on_call", displayName: "On call", valueType: "boolean" },
  { entityType: "organization", code: "cost_center", displayName: "Cost center", valueType: "number" },
  { entityType: "position", code: "work_areas", displayName: "Work areas", valueType: "text_list" },
] as const;

type AttributeProfile = {
  customAttributes?: CustomAttributeValues;
  employments?: readonly {
    isPrimary: boolean;
    organization: { code: string; customAttributes?: CustomAttributeValues };
    position: { code: string; customAttributes?: CustomAttributeValues };
  }[];
};

type RunWithStoppedWorker = (
  observeMissedWake: (dropWake: (code: string) => Promise<void>) => Promise<void>,
) => Promise<void>;

const test = gatewayTest.extend<{ withStoppedWorker: RunWithStoppedWorker }>({
  withStoppedWorker: [
    async ({ gatewayDns: _gatewayDns }, use) => {
      const run = await readManagedResourceRun(process.cwd(), requireEnvironment("IAM_E2E_RESOURCE_RECORD"));
      const project = assertExactProject(`iam-e2e-${requireEnvironment("IAM_E2E_RUN_ID")}`);
      if (run.record.project !== project) throw new Error("E2E resource record does not name the current project");

      const controller = new AbortController();
      const interrupted = new Error("Playwright ended the directory attribute test during Worker recovery");
      let inFlight: Promise<void> | undefined;
      let restoreRequired = false;
      function runDuringTest(args: string[]) {
        controller.signal.throwIfAborted();
        const command = runCompose(run, args, controller.signal);
        inFlight = command;
        return command
          .finally(() => {
            inFlight = undefined;
          })
          .catch(throwFormattedResourceFailure);
      }

      try {
        await use(async (observeMissedWake) => {
          controller.signal.throwIfAborted();
          restoreRequired = true;
          await runDuringTest(["stop", "worker"]);
          await observeMissedWake((code) =>
            runDuringTest([
              "run",
              "--rm",
              "--no-deps",
              "--pull",
              "never",
              "-T",
              "seed",
              "bun",
              "run",
              "src/drop-user-attribute-wake.ts",
              code,
            ]),
          );
          await runDuringTest(["start", "worker"]);
          restoreRequired = false;
        });
      } finally {
        // Playwright can start teardown while the timed-out test body is still running.
        await runWithOwnedTestResources(async ({ registerCleanup }) => {
          if (restoreRequired) registerCleanup(() => runCompose(run, ["start", "worker"]));
          const pending = inFlight;
          controller.abort(interrupted);
          try {
            await pending;
          } catch (error) {
            if (error !== interrupted) throw error;
          }
        }).catch(throwFormattedResourceFailure);
      }
    },
    { timeout: 60_000 },
  ],
});

test("directory attributes follow Admin writes and Worker publication across Internal, OIDC and Custom SSO", async ({
  page,
  request,
  withStoppedWorker,
}) => {
  const origin = requireEnvironment("IAM_E2E_ORIGIN");
  const adminUsername = requireEnvironment("IAM_E2E_ADMIN_USERNAME");
  const adminPassword = requireEnvironment("IAM_E2E_ADMIN_PASSWORD");
  const organizationCode = requireEnvironment("IAM_E2E_ORGANIZATION_CODE");
  const positionCode = requireEnvironment("IAM_E2E_POSITION_CODE");
  const internalApiKey = requireEnvironment("IAM_E2E_INTERNAL_API_KEY");
  const oidcClient = requireEnvironment("IAM_E2E_OIDC_CLIENT_CODE");
  const oidcRedirectUri = requireEnvironment("IAM_E2E_OIDC_REDIRECT_URI");
  const businessClient = requireEnvironment("IAM_E2E_BUSINESS_CLIENT_CODE");
  const businessRedirectUri = `${origin}/e2e/business/landing?view=profile`;
  const expectedAttributes = {
    user: { on_call: false },
    organization: { cost_center: 0 },
    position: { work_areas: ["east", "west"] },
  };
  const omitted = { user: undefined, organization: undefined, position: undefined };

  function selectAttributes(profile: AttributeProfile) {
    const employment = profile.employments?.find(
      ({ organization, position }) => organization.code === organizationCode && position.code === positionCode,
    );
    expect(employment?.isPrimary).toBe(true);
    return {
      user: profile.customAttributes,
      organization: employment?.organization.customAttributes,
      position: employment?.position.customAttributes,
    };
  }

  async function mutate(method: "POST" | "PUT", path: string, data: object) {
    const response = await page.request.fetch(path, { method, headers: { Client: "iam-admin" }, data });
    expect(await successfulJson(response)).toMatchObject({ code: 200, data: { changed: true } });
  }

  async function readInternal() {
    const response = await request.get(`/api/iam/internal/users/${encodeURIComponent(adminUsername)}`, {
      headers: { apikey: internalApiKey },
    });
    return UserDocumentSchema.parse((await successfulJson(response)).data);
  }

  async function readOidc(accessToken: string) {
    const response = await request.get("/oidc/me", { headers: { Authorization: `Bearer ${accessToken}` } });
    const claims = await successfulJson(response);
    expect(claims).toMatchObject({ sub: subjectIdentifier, preferred_username: adminUsername });
    return selectAttributes({
      customAttributes: claims["iam:custom_attributes"],
      employments: claims["iam:employments"],
    });
  }

  async function exchangeBusinessCode() {
    const state = randomUUID();
    const authorize = new URL("/sso/authorize", origin);
    authorize.search = new URLSearchParams({
      client: businessClient,
      redirectUrl: businessRedirectUri,
      state,
    }).toString();
    await page.goto(authorize.href);
    await expect(page).toHaveURL(
      (url) => url.origin === origin && url.pathname === "/e2e/business/callback" && url.searchParams.has("code"),
    );
    const callback = new URL(page.url());
    expect(callback.searchParams.get("state")).toBe(state);
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("Business callback did not contain a Code");
    const response = await request.post("/sso/token", {
      headers: {
        Authorization: `Basic ${Buffer.from(`${businessClient}:e2e-business-secret-local-only`).toString("base64")}`,
      },
      form: { code, redirect_uri: businessRedirectUri },
    });
    const result = (await successfulJson(response)).data;
    expect(result).toMatchObject({ sid: expect.any(String) });
    return result;
  }

  async function readCustomSso(sid: string) {
    const response = await request.get("/api/iam/public/user-info", {
      headers: { Authorization: sid, Client: businessClient },
    });
    return (await successfulJson(response)).data;
  }

  await loginToAdmin({ page, origin, adminUsername, adminPassword });
  const previous = await readInternal();
  const subjectIdentifier = previous.subjectIdentifier;
  expect(previous.username).toBe(adminUsername);
  expect(selectAttributes(previous)).toStrictEqual(omitted);

  await test.step("Save definitions and values through Admin and wait for Internal publication", async () => {
    for (const definition of attributes) await mutate("POST", definitionPath, definition);
    await mutate("PUT", `/api/iam/admin/users/${encodeURIComponent(adminUsername)}`, {
      customAttributes: expectedAttributes.user,
    });
    await mutate("PUT", `/api/iam/admin/organizations/${encodeURIComponent(organizationCode)}`, {
      customAttributes: expectedAttributes.organization,
    });
    await mutate("PUT", `/api/iam/admin/positions/${encodeURIComponent(positionCode)}`, {
      customAttributes: expectedAttributes.position,
    });
    await expect
      .poll(async () => selectAttributes(await readInternal()), { timeout: publicationTimeoutMs })
      .toStrictEqual(expectedAttributes);
  });

  const pkce = createPkceS256Pair();
  const state = randomUUID();
  const authorize = new URL("/oidc/auth", origin);
  authorize.search = new URLSearchParams({
    client_id: oidcClient,
    redirect_uri: oidcRedirectUri,
    response_type: "code",
    scope: "openid profile iam:employments",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    nonce: state,
    state,
  }).toString();
  await page.goto(authorize.href);
  const { code } = receiveOidcAuthorizationCallback(page.url(), { redirectUri: oidcRedirectUri, state });
  const tokenResponse = await request.post("/oidc/token", {
    form: {
      client_id: oidcClient,
      grant_type: "authorization_code",
      code,
      code_verifier: pkce.verifier,
      redirect_uri: oidcRedirectUri,
    },
  });
  const tokens = await successfulJson(tokenResponse);
  expect(tokens).toMatchObject({ access_token: expect.any(String), id_token: expect.any(String) });
  const idToken = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"));
  expect(idToken).toMatchObject({ sub: subjectIdentifier });
  expect(idToken).not.toHaveProperty("iam:custom_attributes");
  expect(idToken).not.toHaveProperty("iam:employments");

  const before =
    await test.step("Deliver published values through OIDC UserInfo and both Custom SSO endpoints", async () => {
      await expect
        .poll(() => readOidc(tokens.access_token), { timeout: publicationTimeoutMs })
        .toStrictEqual(expectedAttributes);
      const exchange = await exchangeBusinessCode();
      expect(exchange.subject).toMatchObject({ version: 5, subjectIdentifier, profile: { username: adminUsername } });
      expect(selectAttributes(exchange.subject.profile)).toStrictEqual(expectedAttributes);
      expect(await readCustomSso(exchange.sid)).toStrictEqual(exchange.subject);
      return exchange;
    });

  await test.step("Disable the definitions and observe omission after Worker republishes", async () => {
    for (const { entityType, code } of attributes) {
      await mutate("POST", `${definitionPath}/enabled`, { entityType, code, enabled: false });
    }
    await expect
      .poll(
        async () => {
          const document = await readInternal();
          expect(document.subjectIdentifier).toBe(subjectIdentifier);
          return selectAttributes(document);
        },
        { timeout: publicationTimeoutMs },
      )
      .toStrictEqual(omitted);
    await expect.poll(() => readOidc(tokens.access_token), { timeout: publicationTimeoutMs }).toStrictEqual(omitted);
    const userInfo = await readCustomSso(before.sid);
    expect(userInfo).toMatchObject({ version: 5, subjectIdentifier, profile: { username: adminUsername } });
    expect(selectAttributes(userInfo.profile)).toStrictEqual(omitted);
    const exchange = await exchangeBusinessCode();
    expect(exchange.subject).toStrictEqual(userInfo);
  });

  await test.step("Repair a missed wake and republish the retained user attribute", async () => {
    const { entityType, code } = attributes[0];
    await withStoppedWorker(async (dropWake) => {
      await mutate("POST", `${definitionPath}/enabled`, { entityType, code, enabled: true });
      await dropWake(code);
      expect(selectAttributes(await readInternal())).toStrictEqual(omitted);
    });

    const restored = { ...omitted, user: expectedAttributes.user };
    await expect
      .poll(async () => selectAttributes(await readInternal()), { timeout: publicationTimeoutMs })
      .toStrictEqual(restored);
    await expect.poll(() => readOidc(tokens.access_token), { timeout: publicationTimeoutMs }).toStrictEqual(restored);
    await expect
      .poll(async () => selectAttributes((await readCustomSso(before.sid)).profile), { timeout: publicationTimeoutMs })
      .toStrictEqual(restored);
    const userInfo = await readCustomSso(before.sid);
    expect(userInfo).toMatchObject({ version: 5, subjectIdentifier, profile: { username: adminUsername } });
    const exchange = await exchangeBusinessCode();
    expect(exchange.subject).toStrictEqual(userInfo);
  });
});

async function runCompose(run: ManagedResourceRun, args: string[], abortSignal?: AbortSignal) {
  const { exitCode, signal, output } = await runManagedComposeCommand(run, args, {
    timeoutMs: composeCommandTimeoutMs,
    signal: abortSignal,
  });
  if (exitCode !== 0 || signal !== null)
    throw new Error(`E2E Compose ${args[0]} failed with exit ${exitCode} and signal ${signal ?? "none"}\n${output}`);
}

function throwFormattedResourceFailure(error: unknown): never {
  // Playwright serializes the message but omits AggregateError.errors.
  if (error instanceof AggregateError) throw new AggregateError(error.errors, formatResourceFailure(error));
  throw error;
}

async function successfulJson(response: APIResponse) {
  expect(response.status(), response.url()).toBe(200);
  return await response.json();
}
