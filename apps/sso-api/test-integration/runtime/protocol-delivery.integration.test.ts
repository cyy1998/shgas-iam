import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { ClientSsoCallbackType, ClientSsoProtocol, SubjectClaim } from "@iam/contracts";
import { auditLogs, clients, users } from "@iam/db/schema";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import {
  createSubjectAccessBarrier,
  requireSubjectAccessOperation,
  type SubjectAccessOperation,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { requireExternalTestUrl } from "@iam/test-support/external-test-resources";
import { createSsoApiApp } from "@sso-api/app";
import { createProtocolOperations } from "@sso-api/composition/sessions";
import { parseSsoApiEnv } from "@sso-api/env";
import { signingKeys } from "@sso-api/testing/oidc-signing.fixture";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import { closeApiRedisConnection, ownApiTestExecutor, resetApiRedisTestDatabase } from "../support/fixture-lifecycle";
import { useApiPostgresTestHarness } from "../support/postgres-test-file.fixture";
import { createTestUserSession } from "../support/test-user-session.fixture";
import { publishUserDocument } from "../support/user-document.fixture";

const getDatabase = useApiPostgresTestHarness();
afterEach(resetApiRedisTestDatabase);

test("standalone managed login appends an audit and serves the two canonical delivery routes", async () => {
  const { databaseUrl, db } = getDatabase();
  const redisUrl = requireExternalTestUrl({
    environment: process.env,
    lane: "SSO API protocol delivery",
    name: "IAM_SSO_API_TEST_REDIS_URL",
  });
  const env = parseSsoApiEnv({
    NODE_ENV: "production",
    IAM_SSO_API_DATABASE_URL: databaseUrl,
    IAM_SSO_API_REDIS_URL: redisUrl,
    IAM_SSO_API_SSO_INTERNAL_ORIGIN: "https://iam.internal",
    IAM_SSO_API_SSO_EXTERNAL_ORIGIN: "https://iam.example",
    IAM_SSO_API_OIDC_CURRENT_JWK_JSON: signingKeys(),
    IAM_SSO_API_LOG_LEVEL: "silent",
  });
  const redis = new Redis(redisUrl);
  ownApiTestExecutor(() => closeApiRedisConnection(redis));
  const { app, close } = await createSsoApiApp({ env });
  ownApiTestExecutor(close);

  const subjectIdentifier = randomUUID();
  const clientCode = "managed-delivery";
  const redirectUrl = "https://app.example/work";
  const [user] = await db
    .insert(users)
    .values({ subjectIdentifier, username: "managed-user", name: "Fixture User" })
    .returning({ id: users.id });
  if (!user) throw new Error("Could not seed the managed delivery identity");
  await publishUserDocument(db, user.id);
  await db.insert(clients).values({
    clientCode,
    clientName: "Managed delivery",
    clientSecret: randomUUID(),
    extAttributes: {},
    ssoEnabled: true,
    ssoConfig: {
      protocol: ClientSsoProtocol.CustomSso,
      callbackType: ClientSsoCallbackType.Managed,
      validRedirectUrls: [redirectUrl],
      subjectClaims: [SubjectClaim.SubjectIdentifier],
    },
  });
  await createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } }).seedMany(
    [{ subjectIdentifier, state: "enabled" }],
    new Date(),
  );
  const kernel = createUnifiedSessionKernel<SubjectAccessOperation>({
    redis,
    ...env.sessionKernel,
    assertOperationActive: requireSubjectAccessOperation,
  });
  const operations = createProtocolOperations(
    kernel,
    createSubjectAccessBarrier({
      clock: { nowDate: () => new Date() },
      random: { uuid: randomUUID },
      store: createRedisSubjectAccessStore({ redis }),
    }),
  );
  const root = await createTestUserSession(kernel, operations, subjectIdentifier);
  const authorize = await app.request(`/sso/authorize?${new URLSearchParams({ client: clientCode, redirectUrl })}`, {
    headers: { Cookie: `global_session=${root}` },
  });
  expect(authorize.status).toBe(302);
  const callbackUrl = authorize.headers.get("Location");
  if (!callbackUrl) throw new Error("Managed authorization omitted its callback");
  const callback = await app.request(callbackUrl);
  expect(callback.status).toBe(302);
  const localCookie = callback.headers.getSetCookie().find((value) => value.startsWith("local_"));
  if (!localCookie) throw new Error("Managed callback omitted its Local Session Cookie");

  const headers = {
    Client: clientCode,
    Cookie: localCookie.slice(0, localCookie.indexOf(";")),
    "X-Forwarded-Uri": "/work",
  };
  const authz = await app.request("/sso/authz", { headers });
  const authzBody = await authz.json();
  const projection = authz.headers.get("X-User-Info");
  expect(authz.status).toBe(200);
  expect(authzBody.data).toBe(projection);
  expect(JSON.parse(Buffer.from(projection ?? "", "base64").toString())).toEqual({ version: 1, subjectIdentifier });

  const userInfo = await app.request("/sso/user-info", { headers });
  const body = await userInfo.json();
  expect(userInfo.status).toBe(200);
  expect(body.data).toEqual({ version: 5, subjectIdentifier });

  const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, "auth.login.local"));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    sourceApp: "sso-api",
    outcome: "success",
    route: "/sso/callback",
    actorType: "system",
    actorSystemKey: "protocol:custom-sso",
    targetType: "subject",
    targetCode: subjectIdentifier,
  });
});
