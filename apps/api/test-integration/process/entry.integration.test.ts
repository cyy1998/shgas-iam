import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import { createServer } from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  customSsoClientRuntimeCacheKey,
  customSsoClientRuntimeGenerationKey,
  customSsoClientRuntimeMutationKey,
} from "@iam/api-core/custom-sso";
import {
  runWithOwnedTestResources,
} from "@iam/api-core/testing/external-test-resources";
import {
  createBoundedProcessLogCapture,
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  FatalReadinessError,
  PortCollisionError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import {
  createProcessSmokeRedisServer,
  seedProcessSmokeClientBinding,
  seedProcessSmokeCredential,
  seedProcessSmokePrincipalSession,
} from "@iam/api-core/testing/process-smoke-redis-server";
import {
  ApiErrorCode,
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { afterEach, describe, expect, test } from "bun:test";
import Redis from "ioredis";

const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
const apiCoreRoot = fileURLToPath(
  new URL("../../../../packages/api-core/", import.meta.url),
);
const loginCredentialPrivateKey = "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65";
const lookupHmacId = "entry-smoke";
const lookupHmacSecret = "api-entry-smoke-secret-that-is-at-least-32-bytes";
const principalSessionToken = `iam_ps_${"a".repeat(43)}`;
const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const subjectAccessTransitionId = "10000000-0000-4000-8000-000000000001";
const gatewayClientCode = "gateway-smoke";
const gatewayConfigVersion = 7;
const gatewayLoginPrincipalSessionToken = `iam_ps_${"c".repeat(43)}`;
const gatewayLocalSessionToken = `iam_ls_${"b".repeat(43)}`;
const gatewayPrincipalSessionId = "principal-session-gateway-smoke";
const gatewayBindingId = "client-binding-gateway-smoke";
const gatewayCredentialId = "credential-gateway-smoke";
const gatewaySubjectIdentifier = "00000000-0000-4000-8000-000000000002";
const gatewaySubjectAccessTransitionId = "10000000-0000-4000-8000-000000000002";
const orcasGatewayClientCode = "gateway-orcas-smoke";
const orcasGatewayPrincipalToken = `iam_ps_${"e".repeat(43)}`;
const orcasGatewayLocalToken = `iam_ls_${"f".repeat(43)}`;
const orcasGatewaySubjectIdentifier = "00000000-0000-4000-8000-000000000004";
const orcasGatewayTransitionId = "10000000-0000-4000-8000-000000000004";
const staleGatewayClientCode = "gateway-stale-smoke";
const staleGatewayPrincipalToken = `iam_ps_${"g".repeat(43)}`;
const staleGatewayLocalToken = `iam_ls_${"h".repeat(43)}`;
const staleGatewaySubjectIdentifier = "00000000-0000-4000-8000-000000000005";
const staleGatewayTransitionId = "10000000-0000-4000-8000-000000000005";
const legacyCleanupPrincipalSessionToken = `iam_ps_${"d".repeat(43)}`;
const legacyCleanupPrincipalSessionId = "principal-session-legacy-cleanup-smoke";
const legacyCleanupSubjectIdentifier = "00000000-0000-4000-8000-000000000003";
const legacyCleanupSubjectAccessTransitionId = "10000000-0000-4000-8000-000000000003";
const legacyPayloadRef = "legacy-payload-entry-smoke";
const legacyPayloadKey = `custom-sso:local-session-payload:${legacyPayloadRef}`;
const cutoverLegacyGlobalSessionId = "cutover-global-entry-smoke";
const cutoverLegacyAuthCode = "cutover-auth-code-entry-smoke";
const cutoverLegacyLocalSessionId = "cutover-local-entry-smoke";
const cutoverLegacyPayloadRef = "cutover-payload-entry-smoke";
const cutoverLegacyIssuedAt = Date.now() - 1_000;
const cutoverLegacyExpiresAt = Date.now() + 60 * 60 * 1_000;
const cutoverLegacyKeys = {
  principalSession: `global_session:${cutoverLegacyGlobalSessionId}`,
  authorizationGrant: `auth_code:${cutoverLegacyAuthCode}`,
  localSession: `local_${gatewayClientCode}_session:${cutoverLegacyLocalSessionId}`,
  localSessionReverse: `local_session_reverse:${cutoverLegacyLocalSessionId}`,
  localSessionSet: `local_session_set:${cutoverLegacyGlobalSessionId}`,
  localSessionPayload: `custom-sso:local-session-payload:${cutoverLegacyPayloadRef}`,
} as const;
const cutoverLegacyUser = {
  id: 1012,
  username: "cutover-legacy-user",
  wxId: null,
  name: "Cutover Legacy User",
  mobile: "13800138012",
  userType: "正式员工" as const,
  orderNum: 1,
  status: 1,
  isDelete: false,
  createTime: new Date("2026-08-02T00:00:00.000Z"),
  updateTime: new Date("2026-08-02T00:00:00.000Z"),
  employments: [],
  roles: [],
  privileges: [],
};
const cutoverLegacyGlobalSession = JSON.stringify({
  version: 1,
  authTime: Math.floor(cutoverLegacyIssuedAt / 1_000),
  user: cutoverLegacyUser,
});
const cutoverLegacyAuthorizationGrant = JSON.stringify({
  sessionId: cutoverLegacyGlobalSessionId,
  data: JSON.stringify(cutoverLegacyUser),
});
const cutoverLegacyLocalSession = JSON.stringify(cutoverLegacyUser);
const cutoverLegacyLocalSessionMember = JSON.stringify({
  clientCode: gatewayClientCode,
  localSessionId: cutoverLegacyLocalSessionId,
  mode: "Gateway",
});
const cutoverLegacyPayload = JSON.stringify({
  version: 1,
  payloadRef: cutoverLegacyPayloadRef,
  credentialId: "cutover-legacy-credential",
  bindingId: "cutover-legacy-binding",
  principalSessionId: cutoverLegacyGlobalSessionId,
  clientCode: gatewayClientCode,
  mode: "Independent",
  localSessionId: cutoverLegacyLocalSessionId,
  user: cutoverLegacyUser,
  issuedAt: cutoverLegacyIssuedAt,
  expiresAt: cutoverLegacyExpiresAt,
  logoutEndpoint: "https://legacy.example.test/logout",
});
const cleanupPreservedOidcKey
  = "oidc:model:AccessToken:cutover-entry-smoke-preserved";
const entrySmoke = createProcessSmokeSuite({
  label: "API entry",
  temporaryDirectoryPrefix: "iam-api-entry-smoke-",
  hostname: "localhost",
});

afterEach(entrySmoke.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

async function createLegacyLogoutObserver() {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => body += chunk);
    request.on("end", () => {
      requests.push(`${request.method} ${request.url} ${body}`);
      response.writeHead(204);
      response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("legacy logout observer did not bind a TCP port");
  }
  return {
    close: async () => await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
    endpoint: `http://127.0.0.1:${address.port}/legacy-logout`,
    requests,
  };
}

function createEntryEnvironment(
  context: ProcessSmokeAttemptContext,
  redisPort: number,
) {
  const origin = entryOrigin(context);
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_API_SMS_SIGNATURE_KEY: "unreachable-smoke-signature",
      IAM_API_SMS_URL: "http://127.0.0.1:1/sms",
      IAM_API_SESSION_DEFAULT_TTL_SECONDS: "3600",
      IAM_API_AUTH_CODE_TTL_SECONDS: "300",
      IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "7",
      IAM_API_ORCAS_URL: "http://127.0.0.1:1/orcas",
      IAM_API_PORT: String(context.port),
      IAM_API_WECHAT_CORP_ID: "unreachable-smoke-corp",
      IAM_API_WECHAT_CORP_SECRET: "unreachable-smoke-secret",
      IAM_API_MAGIC_CODE: "000000",
      IAM_API_REDIS_HOST: "127.0.0.1",
      IAM_API_REDIS_PORT: String(redisPort),
      IAM_API_REDIS_DB: "15",
      IAM_API_LOGIN_ENDPOINT: "/login",
      IAM_API_SSO_INTERNAL_ORIGIN: origin,
      IAM_API_SSO_EXTERNAL_ORIGIN: origin,
      IAM_API_AUTHORIZATION_ENDPOINT: "/sso/authorize",
      IAM_API_LOGOUT_ENDPOINT: "/sso/logout",
      IAM_API_THIRDPARTY_OA_ENDPOINT: "/sso/thirdparty/oa",
      IAM_API_LOG_LEVEL: "info",
      IAM_API_LOG_FORMAT: "json",
      IAM_API_CAP_ENABLED: "false",
      IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "entry-smoke",
      IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
        "entry-smoke": loginCredentialPrivateKey,
      }),
      IAM_API_SESSION_KERNEL_NAMESPACE: `sess:api-entry-smoke:${context.port}:`,
      IAM_API_SESSION_LOOKUP_HMAC_CURRENT_ID: lookupHmacId,
      IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: lookupHmacSecret,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

async function probeApiDocs(origin: string, signal: AbortSignal) {
  const response = await fetch(`${origin}/public/doc`, { signal });
  if (response.status !== 200) {
    throw new PortCollisionError(
      `port served an unexpected API readiness status: expected 200, received ${response.status}`,
    );
  }

  let document: Record<string, unknown>;
  try {
    document = await response.json() as Record<string, unknown>;
  }
  catch (error) {
    throw new PortCollisionError("port did not serve the API OpenAPI document", { cause: error });
  }
  const info = document.info;
  if (
    document.openapi !== "3.1.0"
    || typeof info !== "object"
    || info === null
    || (info as Record<string, unknown>).title !== "通用用户API"
    || (info as Record<string, unknown>).version !== "1.0.0"
  ) {
    throw new PortCollisionError("port served an unexpected API OpenAPI document");
  }
  await assertProjectionDeliveryOpenApi(origin, signal, document);
  return document;
}

async function assertProjectionDeliveryOpenApi(
  origin: string,
  signal: AbortSignal,
  publicDocument: Record<string, unknown>,
) {
  const publicPaths = publicDocument.paths as Record<
    string,
    { get?: { responses?: Record<string, { headers?: Record<string, unknown> }> } }
  > | undefined;
  const userInfo = publicPaths?.["/public/user-info"]?.get;
  if (
    userInfo?.responses?.["503"]?.headers?.["Retry-After"] === undefined
  ) {
    throw new PortCollisionError(
      "Public OpenAPI document does not expose the Custom SSO user-info contract",
    );
  }

  const authResponse = await fetch(`${origin}/auth/doc`, { signal });
  if (authResponse.status !== 200) {
    throw new PortCollisionError(
      `Auth OpenAPI returned ${authResponse.status} instead of 200`,
    );
  }
  const authDocument = await authResponse.json() as {
    paths?: Record<
      string,
      { get?: { responses?: Record<string, { headers?: Record<string, unknown> }> } }
    >;
  };
  const authz = authDocument.paths?.["/auth/authz"]?.get;
  if (
    authz?.responses?.["200"]?.headers?.["X-User-Info"] === undefined
    || authz.responses?.["503"]?.headers?.["Retry-After"] === undefined
  ) {
    throw new PortCollisionError(
      "Auth OpenAPI document does not expose the Gateway authz projection contract",
    );
  }
}

async function probeSubjectAccessBoundary(
  origin: string,
  signal: AbortSignal,
  redis: Pick<
    Awaited<ReturnType<typeof createProcessSmokeRedisServer>>,
    "set"
  >,
) {
  const document = await probeApiDocs(origin, signal);
  const customSso = await probeCustomSsoProtocol(origin, signal);
  const gatewayLogin = await probeGatewayLoginFlow(origin, signal);
  const projectionDelivery = await probeProjectionDelivery(origin, signal);
  const projectionEdges = await probeProjectionEdges(origin, signal);
  const legacyCleanup = await probeLegacyCleanupOwnership(origin, signal, redis);
  const response = await fetch(`${origin}/public/orcasId`, {
    headers: {
      Client: "iam",
      Cookie: `global_session=${principalSessionToken}`,
    },
    signal,
  });
  if (response.status !== 503) {
    throw new FatalReadinessError(
      `API Subject Access boundary returned ${response.status} instead of 503`,
    );
  }
  const body = await response.json() as Record<string, unknown>;
  if (body.code !== ApiErrorCode.SubjectAccessUnavailable) {
    throw new FatalReadinessError(
      `API Subject Access boundary returned unexpected code ${String(body.code)}`,
    );
  }
  return {
    body,
    customSso,
    document,
    gatewayLogin,
    legacyCleanup,
    projectionDelivery,
    projectionEdges,
    setCookie: response.headers.get("set-cookie"),
  };
}

async function probeProjectionEdges(origin: string, signal: AbortSignal) {
  const orcasCookie
    = `local_${orcasGatewayClientCode}_session=${orcasGatewayLocalToken}`;
  const orcasUserInfo = await fetch(`${origin}/public/user-info`, {
    headers: {
      Client: orcasGatewayClientCode,
      Cookie: orcasCookie,
    },
    signal,
  });
  const orcasUserInfoBody = await orcasUserInfo.json() as Record<string, unknown>;
  const orcasAuthz = await fetch(`${origin}/auth/authz`, {
    headers: {
      "Client": orcasGatewayClientCode,
      "Cookie": orcasCookie,
      "X-Forwarded-Uri": "/gateway/orcas-smoke",
    },
    signal,
  });
  const orcasAuthzBody = await orcasAuthz.json() as Record<string, unknown>;
  const orcasProjection = JSON.stringify({
    header: orcasAuthz.headers.get("X-User-Info"),
    userInfo: orcasUserInfoBody,
    authz: orcasAuthzBody,
  });
  if (
    orcasUserInfo.status !== 200
    || orcasAuthz.status !== 200
    || orcasProjection.includes("orcasId")
    || orcasProjection.includes("orcas-entry-smoke-id")
  ) {
    throw new FatalReadinessError(
      `ORCAS-enabled projection isolation returned unexpected ${orcasUserInfo.status}/${orcasAuthz.status}`,
    );
  }

  const stale = await fetch(`${origin}/public/user-info`, {
    headers: {
      Client: staleGatewayClientCode,
      Cookie: `local_${staleGatewayClientCode}_session=${staleGatewayLocalToken}`,
    },
    signal,
  });
  if (stale.status !== 401) {
    throw new FatalReadinessError(
      `stale Custom SSO config returned ${stale.status} instead of 401`,
    );
  }

  return {
    orcas: {
      authzStatus: orcasAuthz.status,
      userInfoStatus: orcasUserInfo.status,
    },
    staleConfigStatus: stale.status,
  };
}

async function probeGatewayLoginFlow(
  origin: string,
  signal: AbortSignal,
) {
  const redirectUrl = `${origin}/gateway/complete`;
  const authorizeUrl = new URL(`${origin}/sso/authorize`);
  authorizeUrl.searchParams.set("client", gatewayClientCode);
  authorizeUrl.searchParams.set("redirectUrl", redirectUrl);
  authorizeUrl.searchParams.set("state", "gateway-entry-smoke-state");
  const authorize = await fetch(authorizeUrl, {
    headers: { Cookie: `global_session=${gatewayLoginPrincipalSessionToken}` },
    redirect: "manual",
    signal,
  });
  const callbackLocation = authorize.headers.get("location");
  if (authorize.status !== 302 || callbackLocation === null) {
    throw new FatalReadinessError(
      `Gateway authorize returned unexpected ${authorize.status}/${callbackLocation}`,
    );
  }

  const callback = await fetch(callbackLocation, {
    redirect: "manual",
    signal,
  });
  const redirectLocation = callback.headers.get("location");
  if (callback.status !== 302 || redirectLocation === null) {
    throw new FatalReadinessError(
      `Gateway callback returned unexpected ${callback.status}/${redirectLocation}`,
    );
  }
  const completed = new URL(redirectLocation);
  const localSessionToken = completed.searchParams.get("token");
  if (
    completed.origin + completed.pathname !== redirectUrl
    || completed.searchParams.get("state") !== "gateway-entry-smoke-state"
    || localSessionToken === null
    || !callback.headers.get("set-cookie")?.includes(localSessionToken)
  ) {
    throw new FatalReadinessError("Gateway callback did not deliver a bound local session");
  }

  const userInfo = await fetch(`${origin}/public/user-info`, {
    headers: {
      Client: gatewayClientCode,
      Cookie: `local_${gatewayClientCode}_session=${localSessionToken}`,
    },
    signal,
  });
  if (userInfo.status !== 200) {
    throw new FatalReadinessError(
      `Gateway callback local session returned ${userInfo.status} instead of 200`,
    );
  }
  return {
    authorizeStatus: authorize.status,
    callbackStatus: callback.status,
    userInfoStatus: userInfo.status,
  };
}

async function probeLegacyCleanupOwnership(
  origin: string,
  signal: AbortSignal,
  redis: Pick<
    Awaited<ReturnType<typeof createProcessSmokeRedisServer>>,
    "set"
  >,
) {
  const namespace = `sess:api-entry-smoke:${new URL(origin).port}:`;
  seedProcessSmokePrincipalSession(redis, {
    cleanupRefs: [{
      protocol: "custom-sso",
      kind: "local_session_payload",
      ref: legacyPayloadRef,
    }],
    externalToken: legacyCleanupPrincipalSessionToken,
    lookupHmacId,
    lookupHmacSecret,
    namespace,
    principalSessionId: legacyCleanupPrincipalSessionId,
    subjectAccessTransitionId: legacyCleanupSubjectAccessTransitionId,
    subjectIdentifier: legacyCleanupSubjectIdentifier,
  });
  redis.set(
    `subject-access:v1:record:${legacyCleanupSubjectIdentifier}`,
    JSON.stringify({
      version: 1,
      subjectIdentifier: legacyCleanupSubjectIdentifier,
      state: "enabled",
      transitionId: legacyCleanupSubjectAccessTransitionId,
      updatedAt: new Date().toISOString(),
    }),
  );
  const observer = await createLegacyLogoutObserver();
  const redirectUrl = `${origin}/legacy-cleanup-complete`;
  const query = new URLSearchParams({
    redirectUrl,
    token: legacyCleanupPrincipalSessionToken,
  });
  redis.set(legacyPayloadKey, JSON.stringify({
    version: 1,
    payloadRef: legacyPayloadRef,
    credentialId: "legacy-credential-entry-smoke",
    bindingId: "legacy-binding-entry-smoke",
    principalSessionId: legacyCleanupPrincipalSessionId,
    clientCode: "legacy-independent-entry-smoke",
    mode: "Independent",
    localSessionId: "legacy-local-session-entry-smoke",
    user: {
      id: 1003,
      username: "legacy-entry-smoke-user",
      wxId: null,
      name: "Legacy Entry Smoke User",
      mobile: "13800138003",
      userType: "正式员工",
      orderNum: 1,
      status: 1,
      isDelete: false,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
      employments: [],
      roles: [],
      privileges: [],
    },
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    logoutEndpoint: observer.endpoint,
  }));
  try {
    const response = await fetch(`${origin}/sso/logout?${query}`, {
      redirect: "manual",
      signal,
    });
    if (response.status !== 302 || response.headers.get("location") !== redirectUrl) {
      throw new FatalReadinessError(
        `legacy cleanup ownership probe returned unexpected ${response.status}/${response.headers.get("location")}`,
      );
    }
    return {
      location: response.headers.get("location"),
      notificationRequests: observer.requests,
      status: response.status,
    };
  }
  finally {
    await observer.close();
  }
}

async function probeProjectionDelivery(origin: string, signal: AbortSignal) {
  const cookie = `local_${gatewayClientCode}_session=${gatewayLocalSessionToken}`;
  const authzResponse = await fetch(`${origin}/auth/authz`, {
    headers: {
      "Client": gatewayClientCode,
      "Cookie": cookie,
      "X-Forwarded-Uri": "/gateway/smoke",
    },
    signal,
  });
  const authzBody = await authzResponse.json() as {
    code?: unknown;
    data?: unknown;
    message?: unknown;
  };
  const encoded = authzBody.data;
  const encodedHeader = authzResponse.headers.get("X-User-Info");
  if (
    authzResponse.status !== 200
    || authzBody.code !== 200
    || typeof encoded !== "string"
    || encodedHeader !== encoded
  ) {
    throw new FatalReadinessError(
      `Gateway authz projection returned unexpected ${authzResponse.status}/${String(authzBody.code)}`,
    );
  }

  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as Record<string, unknown>;
  }
  catch (error) {
    throw new FatalReadinessError(
      "Gateway authz projection was not valid Base64 JSON",
      { cause: error },
    );
  }

  const userInfoResponse = await fetch(`${origin}/public/user-info`, {
    headers: {
      Client: gatewayClientCode,
      Cookie: cookie,
    },
    signal,
  });
  const userInfoBody = await userInfoResponse.json() as {
    code?: unknown;
    data?: unknown;
    message?: unknown;
  };
  if (
    userInfoResponse.status !== 200
    || userInfoBody.code !== 200
    || typeof userInfoBody.data !== "object"
    || userInfoBody.data === null
  ) {
    throw new FatalReadinessError(
      `Custom SSO user-info projection returned unexpected ${userInfoResponse.status}/${String(userInfoBody.code)}`,
    );
  }

  return {
    authz: {
      body: authzBody,
      decoded,
      setCookie: authzResponse.headers.get("set-cookie"),
    },
    userInfo: {
      body: userInfoBody,
      setCookie: userInfoResponse.headers.get("set-cookie"),
    },
  };
}

async function probeCustomSsoProtocol(origin: string, signal: AbortSignal) {
  const documentResponse = await fetch(`${origin}/sso/doc`, { signal });
  if (documentResponse.status !== 200) {
    throw new FatalReadinessError(
      `Custom SSO OpenAPI returned ${documentResponse.status} instead of 200`,
    );
  }
  const document = await documentResponse.json() as {
    components?: { schemas?: Record<string, unknown> };
    paths?: Record<string, Record<string, unknown>>;
  };
  const tokenPath = document.paths?.["/sso/token"];
  const tokenPost = tokenPath?.post as {
    responses?: Record<string, {
      headers?: Record<string, unknown>;
    }>;
  } | undefined;
  const unavailable = tokenPost?.responses?.["503"];
  const schemas = JSON.stringify(document.components?.schemas);
  if (
    tokenPost === undefined
    || tokenPath?.get !== undefined
    || unavailable?.headers?.["Retry-After"] === undefined
    || !schemas.includes(ApiErrorCode.SubjectProjectionNotReady)
    || !schemas.includes(ApiErrorCode.SubjectAccessUnavailable)
  ) {
    throw new FatalReadinessError(
      "Custom SSO OpenAPI does not expose the POST-only retryable token contract",
    );
  }

  const tokenResponse = await fetch(`${origin}/sso/token`, {
    method: "POST",
    headers: {
      "Authorization": "Basic !!!",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: "smoke-auth-code",
      redirect_uri: "https://client.example.com/callback",
    }),
    signal,
  });
  const tokenBody = await tokenResponse.json() as Record<string, unknown>;
  if (
    tokenResponse.status !== 400
    || tokenBody.code !== ApiErrorCode.InvalidSsoClient
  ) {
    throw new FatalReadinessError(
      `Custom SSO token route returned unexpected ${tokenResponse.status}/${String(tokenBody.code)}`,
    );
  }

  return {
    tokenBody,
    tokenPath,
  };
}

function seedGatewayProjectionState(
  redis: Pick<
    Awaited<ReturnType<typeof createProcessSmokeRedisServer>>,
    "set"
  >,
  namespace: string,
  origin: string,
) {
  const metadata = {
    version: 1,
    mode: CustomSsoClientMode.Gateway,
    configVersion: gatewayConfigVersion,
  };
  seedProcessSmokePrincipalSession(redis, {
    externalToken: gatewayLoginPrincipalSessionToken,
    lookupHmacId,
    lookupHmacSecret,
    namespace,
    principalSessionId: gatewayPrincipalSessionId,
    subjectAccessTransitionId: gatewaySubjectAccessTransitionId,
    subjectIdentifier: gatewaySubjectIdentifier,
  });
  seedProcessSmokeClientBinding(redis, {
    bindingId: gatewayBindingId,
    clientCode: gatewayClientCode,
    lookupHmacId,
    lookupHmacSecret,
    metadata,
    namespace,
    principalSessionId: gatewayPrincipalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
    subjectAccessTransitionId: gatewaySubjectAccessTransitionId,
    subjectIdentifier: gatewaySubjectIdentifier,
  });
  seedProcessSmokeCredential(redis, {
    bindingId: gatewayBindingId,
    clientCode: gatewayClientCode,
    credentialId: gatewayCredentialId,
    credentialType: "local_session",
    externalToken: gatewayLocalSessionToken,
    lookupHmacId,
    lookupHmacSecret,
    metadata,
    namespace,
    principalSessionId: gatewayPrincipalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
    subjectAccessTransitionId: gatewaySubjectAccessTransitionId,
    subjectIdentifier: gatewaySubjectIdentifier,
  });
  redis.set(
    `subject-access:v1:record:${gatewaySubjectIdentifier}`,
    JSON.stringify({
      version: 1,
      subjectIdentifier: gatewaySubjectIdentifier,
      state: "enabled",
      transitionId: gatewaySubjectAccessTransitionId,
      updatedAt: new Date().toISOString(),
    }),
  );
  redis.set(
    customSsoClientRuntimeCacheKey(gatewayClientCode),
    JSON.stringify({
      version: 1,
      generation: "0",
      clientCode: gatewayClientCode,
      expiresAt: Date.now() + 60_000,
      client: {
        id: 77,
        clientCode: gatewayClientCode,
        clientName: "Gateway Smoke",
        status: ClientStatus.Enable,
        isDelete: false,
        customSsoEnabled: true,
        customSsoConfig: {
          mode: CustomSsoClientMode.Gateway,
          orcas: { enabled: false },
          subjectClaimCatalogVersion: 1,
          subjectClaims: [
            SubjectClaim.SubjectIdentifier,
            SubjectClaim.ProfileUsername,
            SubjectClaim.ProfileName,
            SubjectClaim.ProfilePhone,
            SubjectClaim.ProfileEmployments,
          ],
          validRedirectUrls: [`${origin}/gateway/*`],
        },
        customSsoConfigVersion: gatewayConfigVersion,
      },
    }),
  );
  redis.set(
    `user-profile:subject-facts:${gatewaySubjectIdentifier}`,
    JSON.stringify({
      schemaVersion: 1,
      sourceDirtyVersion: "9",
      publishedAt: new Date().toISOString(),
      subjectIdentifier: gatewaySubjectIdentifier,
      profile: {
        username: "gateway-smoke-user",
        name: "Gateway Smoke User",
        phone: "13800138000",
      },
      facts: {
        employments: [{
          isPrimary: true,
          organization: {
            code: "engineering",
            name: "Engineering",
            type: "department",
            path: [{
              code: "company",
              name: "Company",
              type: "company",
            }],
          },
          position: {
            code: "developer",
            name: "Developer",
          },
          clientAuthorizations: [{
            clientCode: gatewayClientCode,
            roles: [{
              code: "gateway-user",
              privileges: ["gateway:read"],
            }],
          }],
        }],
      },
    }),
  );
}

function seedGatewayProjectionEdgeStates(
  redis: Pick<
    Awaited<ReturnType<typeof createProcessSmokeRedisServer>>,
    "set"
  >,
  namespace: string,
  origin: string,
) {
  seedGatewayDeliveryScenario(redis, {
    clientCode: orcasGatewayClientCode,
    configVersion: 11,
    externalPrincipalToken: orcasGatewayPrincipalToken,
    externalLocalToken: orcasGatewayLocalToken,
    namespace,
    orcasEnabled: true,
    orcasId: "orcas-entry-smoke-id",
    origin,
    subjectAccessTransitionId: orcasGatewayTransitionId,
    subjectIdentifier: orcasGatewaySubjectIdentifier,
  });
  seedGatewayDeliveryScenario(redis, {
    clientCode: staleGatewayClientCode,
    configVersion: 13,
    credentialConfigVersion: 12,
    externalPrincipalToken: staleGatewayPrincipalToken,
    externalLocalToken: staleGatewayLocalToken,
    namespace,
    orcasEnabled: false,
    origin,
    subjectAccessTransitionId: staleGatewayTransitionId,
    subjectIdentifier: staleGatewaySubjectIdentifier,
  });
}

function seedGatewayDeliveryScenario(
  redis: Pick<
    Awaited<ReturnType<typeof createProcessSmokeRedisServer>>,
    "set"
  >,
  options: {
    readonly clientCode: string;
    readonly configVersion: number;
    readonly credentialConfigVersion?: number;
    readonly externalLocalToken: string;
    readonly externalPrincipalToken: string;
    readonly namespace: string;
    readonly orcasEnabled: boolean;
    readonly orcasId?: string;
    readonly origin: string;
    readonly seedSubjectFacts?: boolean;
    readonly subjectAccessTransitionId: string;
    readonly subjectIdentifier: string;
  },
) {
  const principalSessionId = `principal-${options.clientCode}`;
  const bindingId = `binding-${options.clientCode}`;
  const bindingMetadata = {
    version: 1,
    mode: CustomSsoClientMode.Gateway,
    configVersion: options.credentialConfigVersion ?? options.configVersion,
  };
  seedProcessSmokePrincipalSession(redis, {
    externalToken: options.externalPrincipalToken,
    lookupHmacId,
    lookupHmacSecret,
    namespace: options.namespace,
    principalSessionId,
    subjectAccessTransitionId: options.subjectAccessTransitionId,
    subjectIdentifier: options.subjectIdentifier,
  });
  seedProcessSmokeClientBinding(redis, {
    bindingId,
    clientCode: options.clientCode,
    lookupHmacId,
    lookupHmacSecret,
    metadata: bindingMetadata,
    namespace: options.namespace,
    principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
    subjectAccessTransitionId: options.subjectAccessTransitionId,
    subjectIdentifier: options.subjectIdentifier,
  });
  seedProcessSmokeCredential(redis, {
    bindingId,
    clientCode: options.clientCode,
    credentialId: `credential-${options.clientCode}`,
    credentialType: "local_session",
    externalToken: options.externalLocalToken,
    lookupHmacId,
    lookupHmacSecret,
    metadata: {
      ...bindingMetadata,
      ...(options.orcasId === undefined ? {} : { orcasId: options.orcasId }),
    },
    namespace: options.namespace,
    principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
    subjectAccessTransitionId: options.subjectAccessTransitionId,
    subjectIdentifier: options.subjectIdentifier,
  });
  redis.set(
    `subject-access:v1:record:${options.subjectIdentifier}`,
    JSON.stringify({
      version: 1,
      subjectIdentifier: options.subjectIdentifier,
      state: "enabled",
      transitionId: options.subjectAccessTransitionId,
      updatedAt: new Date().toISOString(),
    }),
  );
  redis.set(
    customSsoClientRuntimeCacheKey(options.clientCode),
    JSON.stringify({
      version: 1,
      generation: "0",
      clientCode: options.clientCode,
      expiresAt: Date.now() + 60_000,
      client: {
        id: options.configVersion,
        clientCode: options.clientCode,
        clientName: `Gateway ${options.clientCode}`,
        status: ClientStatus.Enable,
        isDelete: false,
        customSsoEnabled: true,
        customSsoConfig: {
          mode: CustomSsoClientMode.Gateway,
          orcas: { enabled: options.orcasEnabled },
          subjectClaimCatalogVersion: 1,
          subjectClaims: [
            SubjectClaim.SubjectIdentifier,
            SubjectClaim.ProfileUsername,
            SubjectClaim.ProfileName,
          ],
          validRedirectUrls: [`${options.origin}/${options.clientCode}/*`],
        },
        customSsoConfigVersion: options.configVersion,
      },
    }),
  );
  if (options.seedSubjectFacts === false)
    return;
  redis.set(
    `user-profile:subject-facts:${options.subjectIdentifier}`,
    JSON.stringify({
      schemaVersion: 1,
      sourceDirtyVersion: "1",
      publishedAt: new Date().toISOString(),
      subjectIdentifier: options.subjectIdentifier,
      profile: {
        username: `${options.clientCode}-user`,
        name: `Gateway ${options.clientCode} User`,
        phone: null,
      },
      facts: { employments: [] },
    }),
  );
}

async function runCustomSsoCutoverCleanup(
  redisPort: number,
): Promise<string> {
  return await withOwnedTemporaryDirectory({
    prefix: "iam-api-entry-cutover-cleanup-",
    cleanupTimeoutMs: 5_000,
    run: async (temporaryDirectory) => {
      const outputs: string[] = [];
      for (const mode of ["--apply", "--verify"] as const) {
        const result = await runProcessCommandSmoke({
          label: `API entry cutover cleanup ${mode}`,
          completionTimeoutMs: 10_000,
          cleanupTimeoutMs: 5_000,
          expectedExitCode: 0,
          start: () => spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "--no-env-file",
              "scripts/cleanup-legacy-session-keys.ts",
              "--profile",
              "custom-sso-cutover",
              mode,
              "--batch-size",
              "2",
            ],
            cwd: apiCoreRoot,
            env: createProcessSmokeEnvironment({
              source: process.env,
              temporaryDirectory,
              overrides: {
                IAM_REDIS_HOST: "127.0.0.1",
                IAM_REDIS_PORT: String(redisPort),
                IAM_REDIS_DB: "15",
                FORCE_COLOR: "0",
                NO_COLOR: "1",
              },
            }),
          }),
        });
        outputs.push(result.output);
      }
      return outputs.join("\n");
    },
  });
}

function seedCutoverLegacyArtifacts(
  redis: Pick<
    Awaited<ReturnType<typeof createProcessSmokeRedisServer>>,
    "set" | "zadd"
  >,
) {
  redis.set(cutoverLegacyKeys.principalSession, cutoverLegacyGlobalSession);
  redis.set(
    cutoverLegacyKeys.authorizationGrant,
    cutoverLegacyAuthorizationGrant,
  );
  redis.set(cutoverLegacyKeys.localSession, cutoverLegacyLocalSession);
  redis.set(
    cutoverLegacyKeys.localSessionReverse,
    cutoverLegacyGlobalSessionId,
  );
  redis.zadd(
    cutoverLegacyKeys.localSessionSet,
    cutoverLegacyExpiresAt,
    cutoverLegacyLocalSessionMember,
  );
  redis.set(cutoverLegacyKeys.localSessionPayload, cutoverLegacyPayload);
}

async function probeCurrentEntryRejectsLegacyArtifacts(
  origin: string,
  signal: AbortSignal,
  redis: Pick<
    Awaited<ReturnType<typeof createProcessSmokeRedisServer>>,
    "commands"
  >,
) {
  const commandStart = redis.commands.length;
  const redirectUrl = `${origin}/gateway/cutover-legacy-complete`;
  const authorizeUrl = new URL(`${origin}/sso/authorize`);
  authorizeUrl.searchParams.set("client", gatewayClientCode);
  authorizeUrl.searchParams.set("redirectUrl", redirectUrl);
  authorizeUrl.searchParams.set("token", cutoverLegacyGlobalSessionId);
  const authorize = await fetch(authorizeUrl, {
    redirect: "manual",
    signal,
  });
  const authorizeLocation = authorize.headers.get("location");
  const authorizeRedirectedToLogin = authorize.status === 302
    && authorizeLocation !== null
    && new URL(authorizeLocation, origin).pathname === "/login";

  const callbackUrl = new URL(`${origin}/sso/callback`);
  callbackUrl.searchParams.set("client", gatewayClientCode);
  callbackUrl.searchParams.set("code", cutoverLegacyAuthCode);
  callbackUrl.searchParams.set("redirectUrl", redirectUrl);
  const callback = await fetch(callbackUrl, {
    redirect: "manual",
    signal,
  });

  const legacyCookie
    = `local_${gatewayClientCode}_session=${cutoverLegacyLocalSessionId}`;
  const userInfo = await fetch(`${origin}/public/user-info`, {
    headers: {
      Client: gatewayClientCode,
      Cookie: legacyCookie,
    },
    signal,
  });
  const authz = await fetch(`${origin}/auth/authz`, {
    headers: {
      "Client": gatewayClientCode,
      "Cookie": legacyCookie,
      "X-Forwarded-Uri": "/gateway/legacy-cutover-smoke",
    },
    signal,
  });

  const legacyKeys = new Set<string>(Object.values(cutoverLegacyKeys));
  const legacyKeyReads = redis.commands
    .slice(commandStart)
    .filter(command => command.args.some(argument => legacyKeys.has(argument)))
    .length;
  if (
    !authorizeRedirectedToLogin
    || callback.status !== 401
    || userInfo.status !== 401
    || authz.status !== 401
    || legacyKeyReads !== 0
  ) {
    throw new FatalReadinessError(
      `current API entry accepted or read a legacy-shaped artifact: ${JSON.stringify({
        authorizeLocation,
        authorizeStatus: authorize.status,
        callbackStatus: callback.status,
        userInfoStatus: userInfo.status,
        authzStatus: authz.status,
        legacyKeyReads,
      })}`,
    );
  }

  return {
    authorizeRedirectedToLogin,
    callbackStatus: callback.status,
    legacyKeyReads,
    userInfoStatus: userInfo.status,
    authzStatus: authz.status,
  };
}

describe("API entry", () => {
  test("runs the real production entry through Subject Access and Custom SSO delivery contracts", async () => {
    const redis = await createProcessSmokeRedisServer();
    let childLogCapture: ReturnType<
      typeof createBoundedProcessLogCapture
    > | undefined;
    try {
      const result = await entrySmoke.run({
        start(context) {
          const namespace = `sess:api-entry-smoke:${context.port}:`;
          seedProcessSmokePrincipalSession(redis, {
            externalToken: principalSessionToken,
            lookupHmacId,
            lookupHmacSecret,
            namespace,
            principalSessionId: "principal-session-api-smoke",
            subjectAccessTransitionId,
            subjectIdentifier,
          });
          seedGatewayProjectionState(redis, namespace, entryOrigin(context));
          seedGatewayProjectionEdgeStates(redis, namespace, entryOrigin(context));
          const child = spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "src/index.ts"],
            cwd: apiRoot,
            env: createEntryEnvironment(context, redis.port),
          });
          childLogCapture = createBoundedProcessLogCapture(child, {
            maxBytes: 64 * 1024,
          });
          return child;
        },
        probe: (context, signal) =>
          probeSubjectAccessBoundary(entryOrigin(context), signal, redis),
        childReadinessEvidence: context => `server: ${entryOrigin(context)}`,
      });

      expect(result.document).toMatchObject({
        openapi: "3.1.0",
        info: {
          title: "通用用户API",
          version: "1.0.0",
        },
      });
      expect(result.body).toEqual({
        code: ApiErrorCode.SubjectAccessUnavailable,
        data: null,
        message: "账号访问状态暂时不可用",
      });
      expect(result.customSso.tokenBody).toEqual({
        code: ApiErrorCode.InvalidSsoClient,
        data: null,
        message: "非法Client",
      });
      expect(result.customSso.tokenPath).toHaveProperty("post");
      expect(result.customSso.tokenPath).not.toHaveProperty("get");
      expect(result.gatewayLogin).toEqual({
        authorizeStatus: 302,
        callbackStatus: 302,
        userInfoStatus: 200,
      });
      expect(result.legacyCleanup).toEqual({
        location: expect.stringContaining("/legacy-cleanup-complete"),
        notificationRequests: [],
        status: 302,
      });
      expect(result.setCookie).toBeNull();
      expect(result.projectionDelivery.authz.body).toEqual({
        code: 200,
        data: expect.any(String),
        message: "success",
      });
      expect(result.projectionDelivery.authz.decoded).toEqual({
        version: 1,
        subjectIdentifier: gatewaySubjectIdentifier,
        username: "gateway-smoke-user",
        name: "Gateway Smoke User",
      });
      expect(result.projectionDelivery.authz.decoded).not.toHaveProperty("id");
      expect(result.projectionDelivery.authz.decoded).not.toHaveProperty("profile");
      expect(result.projectionDelivery.authz.decoded).not.toHaveProperty("authorization");
      expect(result.projectionDelivery.authz.decoded).not.toHaveProperty("orcasId");
      expect(result.projectionDelivery.authz.setCookie).toBeNull();
      expect(result.projectionDelivery.userInfo.body).toEqual({
        code: 200,
        data: {
          version: 1,
          subjectIdentifier: gatewaySubjectIdentifier,
          profile: {
            username: "gateway-smoke-user",
            name: "Gateway Smoke User",
            phone: "13800138000",
            employments: [{
              isPrimary: true,
              organization: {
                code: "engineering",
                name: "Engineering",
                type: "department",
                path: [{
                  code: "company",
                  name: "Company",
                  type: "company",
                }],
              },
              position: {
                code: "developer",
                name: "Developer",
              },
            }],
          },
        },
        message: "success",
      });
      expect(result.projectionDelivery.userInfo.body.data).not.toHaveProperty("id");
      expect(result.projectionDelivery.userInfo.body.data).not.toHaveProperty("authorization");
      expect(result.projectionDelivery.userInfo.body.data).not.toHaveProperty("orcasId");
      expect(result.projectionDelivery.userInfo.setCookie).toBeNull();
      expect(result.projectionEdges).toEqual({
        orcas: {
          authzStatus: 200,
          userInfoStatus: 200,
        },
        staleConfigStatus: 401,
      });
      const subjectFactsObservation = (childLogCapture?.snapshot() ?? "")
        .split(/\r?\n/u)
        .map((line) => {
          try {
            return JSON.parse(
              line.replace(/^\[(?:stdout|stderr)\]\s/u, ""),
            ) as Record<string, unknown>;
          }
          catch {
            return null;
          }
        })
        .find(line => line?.event === "subject_facts.operation.observed");
      expect(subjectFactsObservation).toMatchObject({
        event: "subject_facts.operation.observed",
        operation: "cache-read",
        outcome: "hit",
        durationMs: expect.any(Number),
      });
      const serializedObservation = JSON.stringify(subjectFactsObservation);
      for (const sensitiveValue of [
        gatewaySubjectIdentifier,
        gatewayLocalSessionToken,
        "gateway-smoke-user",
        "Gateway Smoke User",
        "13800138000",
      ]) {
        expect(serializedObservation).not.toContain(sensitiveValue);
      }
      expect(redis.commands).toContainEqual({
        name: "get",
        args: [`subject-access:v1:record:${subjectIdentifier}`],
      });
      expect(redis.commands).toContainEqual({
        name: "eval",
        args: [
          expect.stringContaining("-- custom-sso-client-runtime:read"),
          "3",
          customSsoClientRuntimeCacheKey(gatewayClientCode),
          customSsoClientRuntimeMutationKey(gatewayClientCode),
          customSsoClientRuntimeGenerationKey(gatewayClientCode),
        ],
      });
      expect(redis.commands).toContainEqual({
        name: "get",
        args: [`user-profile:subject-facts:${gatewaySubjectIdentifier}`],
      });
      expect(redis.commands.some(command =>
        command.name === "set"
        && command.args[0]?.endsWith(
          `revoked:p:${legacyCleanupPrincipalSessionId}`,
        ) === true
        && command.args[1]?.includes(`"ref":"${legacyPayloadRef}"`) === true,
      )).toBeTrue();
      expect(redis.commands).not.toContainEqual({
        name: "get",
        args: [legacyPayloadKey],
      });
      expect(redis.commands.some(command =>
        command.name === "del" && command.args.includes(legacyPayloadKey),
      )).toBeFalse();
      expect(redis.delete(legacyPayloadKey)).toBeTrue();
    }
    finally {
      childLogCapture?.dispose();
      await redis.close();
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("rejects legacy-shaped artifacts and cleans only their inventory while preserving current sessions", async () => {
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      const redis = await createProcessSmokeRedisServer({
        values: new Map([[cleanupPreservedOidcKey, "preserved-oidc-artifact"]]),
      });
      registerCleanup(async () => await redis.close());
      seedCutoverLegacyArtifacts(redis);
      const legacyRedis = new Redis({
        host: redis.hostname,
        port: redis.port,
        enableReadyCheck: false,
        maxRetriesPerRequest: 1,
      });
      registerCleanup(() => legacyRedis.disconnect());

      const result = await entrySmoke.run({
        start(context) {
          const namespace = `sess:api-entry-smoke:${context.port}:`;
          seedGatewayProjectionState(redis, namespace, entryOrigin(context));
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "src/index.ts"],
            cwd: apiRoot,
            env: createEntryEnvironment(context, redis.port),
          });
        },
        probe: async (context, signal) => {
          const origin = entryOrigin(context);
          const document = await probeApiDocs(origin, signal);
          const rejectedBeforeCleanup
            = await probeCurrentEntryRejectsLegacyArtifacts(origin, signal, redis);
          const currentSessionBefore = await probeProjectionDelivery(
            origin,
            signal,
          );

          const cleanupOutput = await runCustomSsoCutoverCleanup(redis.port);
          const rejectedAfterCleanup
            = await probeCurrentEntryRejectsLegacyArtifacts(origin, signal, redis);
          const currentSessionAfter = await probeProjectionDelivery(
            origin,
            signal,
          );
          return {
            cleanupOutput,
            currentSessionAfter,
            currentSessionBefore,
            document,
            oidcValue: await legacyRedis.get(cleanupPreservedOidcKey),
            rejectedAfterCleanup,
            rejectedBeforeCleanup,
          };
        },
        childReadinessEvidence: context => `server: ${entryOrigin(context)}`,
      });

      expect(result.document).toMatchObject({ openapi: "3.1.0" });
      expect(result.rejectedBeforeCleanup).toEqual(
        result.rejectedAfterCleanup,
      );
      expect(result.rejectedBeforeCleanup).toEqual({
        authorizeRedirectedToLogin: true,
        callbackStatus: 401,
        legacyKeyReads: 0,
        userInfoStatus: 401,
        authzStatus: 401,
      });
      const cleanupOutput = result.cleanupOutput;
      expect(cleanupOutput).toContain("\"mode\":\"apply\"");
      expect(cleanupOutput).toContain("\"mode\":\"verify\"");
      expect(cleanupOutput).toContain("\"result\":\"completed\"");
      const cleanupEvents = cleanupOutput
        .trim()
        .split(/\r?\n/u)
        .map(line => line.replace(/^\[(?:stdout|stderr)\]\s/u, ""))
        .filter(line => line.startsWith("{"))
        .map(line => JSON.parse(line) as Record<string, unknown>);
      const applyEvent = cleanupEvents.find(event => event.mode === "apply");
      const verifyEvent = cleanupEvents.find(event => event.mode === "verify");
      expect(applyEvent?.deletedCounts).toEqual({
        "global-session": 1,
        "custom-sso-auth-code": 1,
        "custom-sso-local-session": 1,
        "custom-sso-local-session-reverse": 1,
        "custom-sso-local-session-set": 1,
        "custom-sso-local-session-payload": 1,
      });
      expect(verifyEvent?.patternCounts).toEqual({
        "global-session": 0,
        "custom-sso-auth-code": 0,
        "custom-sso-local-session": 0,
        "custom-sso-local-session-reverse": 0,
        "custom-sso-local-session-set": 0,
        "custom-sso-local-session-payload": 0,
      });
      for (const sensitiveValue of [
        ...Object.values(cutoverLegacyKeys),
        cutoverLegacyGlobalSessionId,
        cutoverLegacyAuthCode,
        cutoverLegacyLocalSessionId,
        cutoverLegacyUser.username,
      ]) {
        expect(cleanupOutput).not.toContain(sensitiveValue);
      }
      expect(result.currentSessionBefore.userInfo.body).toMatchObject({
        code: 200,
      });
      expect(result.currentSessionAfter.userInfo.body).toEqual(
        result.currentSessionBefore.userInfo.body,
      );
      expect(result.currentSessionAfter.authz.body).toEqual(
        result.currentSessionBefore.authz.body,
      );
      expect(result.oidcValue).toBe("preserved-oidc-artifact");
      expect(redis.delete(cleanupPreservedOidcKey)).toBeTrue();
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
