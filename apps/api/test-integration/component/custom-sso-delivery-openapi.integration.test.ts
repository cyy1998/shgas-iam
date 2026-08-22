import { createAuthHandlers } from "@api/routes/auth/auth.handlers";
import { createAuthRoute } from "@api/routes/auth/auth.index";
import { createPublicHandlers } from "@api/routes/public/public.handlers";
import { createPublicRoute } from "@api/routes/public/public.index";
import createApp from "@iam/api-core/core/create-app";
import { defineConfig } from "@iam/api-core/core/define-config";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import pino from "pino";

const CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME
  = "CustomSsoSessionAuthorization";

function createContractApp() {
  const logger = pino({ enabled: false });
  const authHandlers = createAuthHandlers({
    authentication: {
      loginWithMobile: {
        execute: mock(async () => ({
          isMobileSet: true,
          token: "principal-session",
        })),
      },
      loginWithPassword: {
        execute: mock(async () => ({
          isMobileSet: true,
          token: "principal-session",
        })),
      },
    },
    clientService: {
      getClientBySecret: mock(async () => null),
    },
    localSessionAuthorizer: {
      authorizeLocalSession: mock(async () => "base64-subject"),
    },
    loginCredentialParser: {
      parseLoginPasswordCredential: mock(async () => ({
        password: "password",
        username: "username",
      })),
    },
    logger,
    trafficGate: {
      assertSessionUseAllowed: async () => undefined,
    },
    config: {
      projectionRetryAfterSeconds: 3,
      redisExpireSeconds: 3600,
    },
  });
  const publicHandlers = createPublicHandlers({
    organizationService: {
      searchOrganizations: mock(async () => []),
    },
    subjectDeliveryRequests: {
      resolveUserInfoForRequest: mock(async () => ({
        version: 1 as const,
        subjectIdentifier: "00000000-0000-4000-8000-000000001001",
      })),
    },
    userService: {
      getActiveUserBySubjectIdentifier: mock(async () => null),
      getUserDetailById: mock(async () => {
        throw new Error("not used");
      }),
      searchUsers: mock(async () => []),
      setMobile: mock(async () => true),
      setPassword: mock(async () => true),
    },
    config: {
      projectionRetryAfterSeconds: 3,
    },
  } as never);

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
      "src/routes/auth/auth.index.ts": {
        default: createAuthRoute(authHandlers),
      },
      "src/routes/public/public.index.ts": {
        default: createPublicRoute(publicHandlers),
      },
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
