import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import { createRootAuthenticationComposition } from "@api/composition/root-authentication";
import createApp from "@iam/api-core/core/create-app";
import { defineConfig } from "@iam/api-core/core/define-config";
import { requireSubjectAccessOperation } from "@iam/api-core/subject-access";
import { ApiErrorCode } from "@iam/contracts";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import { describe, expect, test } from "bun:test";
import pino from "pino";

const CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME
  = "CustomSsoSessionAuthorization";

function unexpectedDependencyCall(): never {
  throw new Error("OpenAPI and missing-header validation must not access backing services");
}

function createContractApp() {
  const logger = pino({ enabled: false });
  const redis = { eval: unexpectedDependencyCall };
  const composition = createRootAuthenticationComposition({
    kernel: createUnifiedSessionKernel<SubjectAccessOperation>({
      redis,
      namespace: "openapi-test",
      userSessionTtlSeconds: 3600,
      clientSessionTtlSeconds: 3600,
      assertOperationActive: requireSubjectAccessOperation,
    }),
    barrier: { readCommittedTransitionId: unexpectedDependencyCall },
    clients: { acquire: unexpectedDependencyCall },
    subjectFacts: { read: unexpectedDependencyCall },
    internalClients: { getClientBySecret: unexpectedDependencyCall },
    internalAuthzLogger: logger,
    loginCredentialParser: { parseLoginPasswordCredential: unexpectedDependencyCall },
    logger,
    config: { projectionRetryAfterSeconds: 3, redisExpireSeconds: 3600, loginEndpoint: "/login" },
    customSso: {
      redis,
      namespace: "openapi-test",
      codeTtlSeconds: 60,
      continuationTtlSeconds: 60,
    },
    customSsoAccess: { tokenTtlSeconds: 3600, credentials: { authenticate: unexpectedDependencyCall } },
    authentication: {
      auditLogWriter: { recordAuditLog: unexpectedDependencyCall },
      runtime: {
        clock: { now: unexpectedDependencyCall },
        config: { auth: { magicCode: "test" }, env: { nodeEnv: "test" } },
        redis: { get: unexpectedDependencyCall, set: unexpectedDependencyCall, del: unexpectedDependencyCall },
        integrations: { wechat: { getWxUserId: unexpectedDependencyCall } },
      },
      services: {
        cap: { ensureActionAllowed: unexpectedDependencyCall },
        client: { getClientByCode: unexpectedDependencyCall },
        humanRisk: { recordLoginFailure: unexpectedDependencyCall },
        loginRestriction: {
          getRestriction: unexpectedDependencyCall,
          clearLoginState: unexpectedDependencyCall,
          recordFailure: unexpectedDependencyCall,
        },
        mobile: { consumeVerificationCode: unexpectedDependencyCall },
        user: {
          checkPassword: unexpectedDependencyCall,
          getActiveUserByUsername: unexpectedDependencyCall,
          getActiveUserByMobile: unexpectedDependencyCall,
          getActiveUserByWxId: unexpectedDependencyCall,
          getActiveUserById: unexpectedDependencyCall,
          getUserDetailById: unexpectedDependencyCall,
        },
      },
    },
    publicServices: {
      organizationService: { searchOrganizations: unexpectedDependencyCall },
      userProfileSearch: { searchLegacyUsers: unexpectedDependencyCall },
      userService: {
        getActiveUserBySubjectIdentifier: unexpectedDependencyCall,
        getUserDetailById: unexpectedDependencyCall,
        setMobile: unexpectedDependencyCall,
        setPassword: unexpectedDependencyCall,
      },
    },
  });
  return createApp(defineConfig({
    prefix: "",
    openapi: { enabled: true, docEndpoint: "/doc" },
    tiers: [
      { name: "public", title: "Public" },
      { name: "auth", title: "Auth" },
    ],
  }), {
    env: { NODE_ENV: "test" },
    logger,
    routes: {
      "src/routes/auth/auth.index.ts": { default: composition.routers.auth },
      "src/routes/public/public.index.ts": { default: composition.routers.public },
    },
    middlewares: {},
  });
}

describe("Custom SSO delivery OpenAPI", () => {
  test("publishes the shared V2 user-info projection and retryable 503", async () => {
    const app = createContractApp();
    const response = await app.request("/public/doc");
    const document = await response.json() as {
      components: {
        schemas: Record<string, unknown>;
        securitySchemes?: Record<string, unknown>;
      };
      paths: Record<string, {
        get?: {
          description?: string;
          parameters?: Array<Record<string, unknown>>;
          responses: Record<string, unknown>;
          security?: Array<Record<string, unknown>>;
        };
      }>;
    };
    const operation = document.paths["/public/user-info"]?.get;
    if (operation === undefined)
      throw new Error("expected /public/user-info");

    expect(operation.responses["503"]).toMatchObject({
      headers: {
        "Retry-After": {
          schema: { type: "string" },
        },
      },
    });
    const contract = JSON.stringify({
      operation,
      projection:
        document.components.schemas.CustomSsoSubjectProjectionV2,
      unavailable:
        document.components.schemas.CustomSsoUnavailableResponse,
    });
    expect(contract).toContain("subjectIdentifier");
    expect(contract).toContain(ApiErrorCode.SubjectProjectionNotReady);
    expect(contract).toContain(ApiErrorCode.SubjectAccessUnavailable);
    expect(contract).toContain(ApiErrorCode.Maintenance);
    expect(contract).toContain(ApiErrorCode.InternalError);
    expect(contract).not.toContain("\"id\"");
    expect(contract).not.toContain("userInfo");
    expect(document.components.schemas.CustomSsoSubjectProjectionV2).toMatchObject({
      additionalProperties: false,
      properties: {
        version: { enum: [2] },
        profile: {
          additionalProperties: false,
          properties: {
            employments: {
              items: {
                properties: {
                  responsibilities: { type: "array" },
                },
              },
            },
          },
        },
      },
    });
    expect(operation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        in: "header",
        name: "Client",
        required: true,
      }),
    ]));
    expect(operation.parameters).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        in: "header",
        name: "Authorization",
      }),
    ]));
    expect(
      document.components.securitySchemes?.[
        CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME
      ],
    ).toEqual({
      type: "apiKey",
      in: "header",
      name: "Authorization",
      description:
        "Opaque Principal or Local Session ID selected by the Client header. Send the raw value without a Bearer prefix.",
    });
    expect(operation.security).toEqual([
      {
        [CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME]: [],
      },
    ]);
    expect(operation.security).not.toContainEqual({});
    expect(operation.description).toContain("authenticated session");
    expect(operation.description).toContain("global_session");
    expect(operation.description).toContain("Client=iam");
    expect(operation.description).toContain(
      "local_{encodedClientCode}_session",
    );
    expect(JSON.stringify(operation.parameters)).toContain(
      "encoded Client Code",
    );
  });

  test("documents identical Base64 body/header delivery and retryable 503 for authz", async () => {
    const app = createContractApp();
    const response = await app.request("/auth/doc");
    const document = await response.json() as {
      components: {
        securitySchemes?: Record<string, unknown>;
      };
      paths: Record<string, {
        get?: {
          description?: string;
          parameters?: Array<Record<string, unknown>>;
          responses: Record<string, unknown>;
          security?: Array<Record<string, unknown>>;
        };
      }>;
    };
    const operation = document.paths["/auth/authz"]?.get;
    if (operation === undefined)
      throw new Error("expected /auth/authz");

    expect(operation.responses["200"]).toMatchObject({
      headers: {
        "X-User-Info": {
          schema: { type: "string" },
        },
      },
    });
    expect(operation.responses["503"]).toMatchObject({
      headers: {
        "Retry-After": {
          schema: { type: "string" },
        },
      },
    });
    expect(operation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        in: "header",
        name: "Client",
        required: true,
      }),
      expect.objectContaining({
        in: "header",
        name: "X-Forwarded-Uri",
        required: true,
      }),
    ]));
    expect(operation.parameters).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        in: "header",
        name: "Authorization",
      }),
    ]));
    expect(
      document.components.securitySchemes?.[
        CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME
      ],
    ).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "Authorization",
    });
    expect(operation.security).toEqual([
      {
        [CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME]: [],
      },
    ]);
    expect(operation.security).not.toContainEqual({});
    expect(operation.description).toContain(
      "local_{encodedClientCode}_session",
    );
    expect(operation.description).toContain("authenticated Local Session");
  });

  test("keeps authz missing-header failures under the stable unauthorized semantics", async () => {
    const app = createContractApp();

    const response = await app.request("/auth/authz");

    expect(response.status).toBe(401);
  });
});
