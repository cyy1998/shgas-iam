import { createSessionManagementAdapter } from "@admin-api/routes/admin/session-management/session-management.adapter";
import { createSessionManagementRoute } from "@admin-api/routes/admin/session-management/session-management.index";
import { SessionManagementReleaseLoginRestrictionInputSchema } from "@admin-api/routes/admin/session-management/session-management.schema";
import { expect, mock, test } from "bun:test";

function createDocument() {
  const adapter = createSessionManagementAdapter({
    sessionManagementService: {
      listLoginRestrictions: mock(async () => ({
        result: [],
        total: 0,
        pageNum: 1,
        pageSize: 20,
        pages: 0,
      })),
      listSessions: mock(async () => ({
        result: [],
        total: 0,
        pageNum: 1,
        pageSize: 20,
        pages: 0,
      })),
      revokeSessions: mock(async () => ({
        changed: false,
        scope: "session" as const,
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
        },
      })),
      releaseLoginRestriction: mock(async () => ({
        changed: false,
        failureStateCleared: true as const,
      })),
    },
  });
  const route = createSessionManagementRoute(adapter);

  return route.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "test", version: "1" },
  });
}

test("publishes the fixed session search REST path with success and unavailable responses", () => {
  const document = createDocument();
  const operation = document.paths?.["/session-management/sessions/search"]?.post;

  expect(operation).toBeDefined();
  expect(operation?.responses).toHaveProperty("200");
  expect(operation?.responses).toHaveProperty("503");
});

test("publishes the fixed session revoke REST path with success and explicit failure responses", () => {
  const document = createDocument();
  const operation = document.paths?.["/session-management/sessions/revoke"]?.post;

  expect(operation).toBeDefined();
  expect(operation?.responses).toHaveProperty("200");
  expect(operation?.responses).toHaveProperty("409");
  expect(operation?.responses).toHaveProperty("500");
  expect(operation?.responses).toHaveProperty("503");
});

test("publishes the fixed login restriction REST paths with success and unavailable responses", () => {
  const document = createDocument();
  const search = document.paths?.["/session-management/login-restrictions/search"]?.post;
  const release = document.paths?.["/session-management/login-restrictions/{userId}"]?.delete;

  expect(search).toBeDefined();
  expect(search?.responses).toHaveProperty("200");
  expect(search?.responses).toHaveProperty("503");
  expect(release).toBeDefined();
  expect(release?.responses).toHaveProperty("200");
  expect(release?.responses).toHaveProperty("500");
  expect(release?.responses).toHaveProperty("503");
});

test("documents one required positive-integer userId path parameter for restriction release", () => {
  const document = createDocument();
  const release = document.paths?.[
    "/session-management/login-restrictions/{userId}"
  ]?.delete;

  expect(release?.parameters).toEqual([{
    name: "userId",
    in: "path",
    required: true,
    schema: {
      type: "integer",
      exclusiveMinimum: 0,
    },
  }]);
  expect(SessionManagementReleaseLoginRestrictionInputSchema.safeParse({
    userId: 42,
    actorUserId: 7,
  }).success).toBe(false);
  expect(SessionManagementReleaseLoginRestrictionInputSchema.safeParse({
    userId: 0,
  }).success).toBe(false);
  expect(SessionManagementReleaseLoginRestrictionInputSchema.safeParse({
    userId: "42",
  }).success).toBe(false);
});

test("documents strict client pagination and exact numeric user filtering without actor fields", () => {
  const document = createDocument();
  const input = document.components?.schemas?.SessionManagementListSessionsInput as {
    additionalProperties?: boolean;
    properties?: Record<string, unknown>;
  };

  expect(input).toMatchObject({
    type: "object",
    additionalProperties: false,
    properties: {
      conditions: {
        type: "object",
        default: {},
        additionalProperties: false,
        properties: {
          userId: {
            type: "integer",
            exclusiveMinimum: 0,
          },
        },
      },
      pageNum: {
        type: "integer",
        exclusiveMinimum: 0,
        default: 1,
      },
      pageSize: {
        type: "integer",
        exclusiveMinimum: 0,
        maximum: 100,
        default: 20,
      },
    },
  });
  expect(Object.keys(input.properties ?? {})).toEqual([
    "conditions",
    "pageNum",
    "pageSize",
  ]);
  expect(JSON.stringify(input)).not.toContain("actorUserId");
  expect(JSON.stringify(input)).not.toContain("principalSessionId");
});

test("documents strict login restriction pagination and exact numeric user filtering", () => {
  const document = createDocument();
  const input = document.components?.schemas?.SessionManagementListLoginRestrictionsInput as {
    additionalProperties?: boolean;
    properties?: Record<string, unknown>;
  };

  expect(input).toMatchObject({
    type: "object",
    additionalProperties: false,
    properties: {
      conditions: {
        type: "object",
        default: {},
        additionalProperties: false,
        properties: {
          userId: {
            type: "integer",
            exclusiveMinimum: 0,
          },
        },
      },
      pageNum: {
        type: "integer",
        exclusiveMinimum: 0,
        default: 1,
      },
      pageSize: {
        type: "integer",
        exclusiveMinimum: 0,
        maximum: 100,
        default: 20,
      },
    },
  });
  expect(Object.keys(input.properties ?? {})).toEqual([
    "conditions",
    "pageNum",
    "pageSize",
  ]);
  expect(JSON.stringify(input)).not.toContain("actorUserId");
  expect(JSON.stringify(input)).not.toContain("principalSessionId");
});

test("documents an exact safe session VO without raw or secret session fields", () => {
  const document = createDocument();
  const session = document.components?.schemas?.SessionManagementSessionVo as {
    additionalProperties?: boolean;
    properties?: Record<string, {
      additionalProperties?: boolean;
    }>;
  };

  expect(session.additionalProperties).toBe(false);
  expect(Object.keys(session.properties ?? {})).toEqual([
    "principalSessionId",
    "user",
    "authMethods",
    "authTime",
    "expiresAt",
    "origin",
    "isCurrentSession",
    "isCurrentUser",
  ]);
  expect(session.properties?.user?.additionalProperties).toBe(false);
  expect(session.properties?.origin?.additionalProperties).toBe(false);

  const serializedSchema = JSON.stringify(session).toLowerCase();
  for (const forbiddenField of [
    "useragent",
    "lastactiveat",
    "externaltoken",
    "lookup",
    "hmac",
    "metadata",
    "cleanup",
    "secret",
  ]) {
    expect(serializedSchema).not.toContain(forbiddenField);
  }
});

test("documents an exact safe login restriction VO and release result", () => {
  const document = createDocument();
  const restriction = document.components?.schemas?.SessionManagementLoginRestrictionVo as {
    additionalProperties?: boolean;
    properties?: Record<string, {
      additionalProperties?: boolean;
      enum?: string[];
      properties?: Record<string, unknown>;
    }>;
  };
  const release = document.components?.schemas?.SessionManagementReleaseLoginRestrictionResultVo as {
    additionalProperties?: boolean;
    properties?: Record<string, unknown>;
  };

  expect(restriction.additionalProperties).toBe(false);
  expect(Object.keys(restriction.properties ?? {})).toEqual([
    "user",
    "cause",
    "triggerMethod",
    "restrictedUntil",
    "remainingSeconds",
  ]);
  expect(restriction.properties?.user?.additionalProperties).toBe(false);
  expect(Object.keys(restriction.properties?.user?.properties ?? {})).toEqual([
    "id",
    "username",
    "name",
    "accountStatus",
  ]);
  expect(restriction.properties?.cause?.enum).toEqual([
    "too_many_login_failures",
  ]);
  expect(restriction.properties?.triggerMethod?.enum).toEqual([
    "mobile",
    "password",
    "unknown",
  ]);
  expect(release.additionalProperties).toBe(false);
  expect(Object.keys(release.properties ?? {})).toEqual([
    "changed",
    "failureStateCleared",
  ]);

  const serializedSchemas = JSON.stringify({ release, restriction }).toLowerCase();
  for (const forbiddenField of [
    "index",
    "raw",
    "redis",
    "session",
    "token",
    "error",
  ]) {
    expect(serializedSchemas).not.toContain(forbiddenField);
  }
});

test("documents strict session and user revoke targets without client-owned actor or exception context", () => {
  const document = createDocument();
  const input = document.components?.schemas?.SessionManagementRevokeSessionsInput as {
    additionalProperties?: boolean;
    properties?: Record<string, {
      oneOf?: Array<{
        additionalProperties?: boolean;
        properties?: Record<string, unknown>;
      }>;
    }>;
  };

  expect(input.additionalProperties).toBe(false);
  expect(Object.keys(input.properties ?? {})).toEqual(["target"]);
  expect(input.properties?.target?.oneOf).toEqual([
    expect.objectContaining({
      additionalProperties: false,
      properties: expect.objectContaining({
        type: expect.objectContaining({ enum: ["session"] }),
        principalSessionId: expect.any(Object),
      }),
    }),
    expect.objectContaining({
      additionalProperties: false,
      properties: expect.objectContaining({
        type: expect.objectContaining({ enum: ["user"] }),
        userId: expect.objectContaining({
          type: "integer",
          exclusiveMinimum: 0,
        }),
      }),
    }),
  ]);
  const serializedInput = JSON.stringify(input);
  expect(serializedInput).not.toContain("actorUserId");
  expect(serializedInput).not.toContain("actorUsername");
  expect(serializedInput).not.toContain("requestId");
  expect(serializedInput).not.toContain("traceId");
  expect(serializedInput).not.toContain("exceptPrincipalSessionId");
});

test("documents an exact safe revoke result with counts but no target or cleanup internals", () => {
  const document = createDocument();
  const result = document.components?.schemas?.SessionManagementRevokeSessionsResultVo as {
    additionalProperties?: boolean;
    properties?: Record<string, {
      additionalProperties?: boolean;
      properties?: Record<string, unknown>;
    }>;
  };

  expect(result.additionalProperties).toBe(false);
  expect(Object.keys(result.properties ?? {})).toEqual([
    "changed",
    "scope",
    "revoked",
    "currentPrincipalSessionExcluded",
    "cleanup",
  ]);
  expect(result.properties?.revoked?.additionalProperties).toBe(false);
  expect(Object.keys(result.properties?.revoked?.properties ?? {})).toEqual([
    "principalSessions",
    "bindings",
    "credentials",
    "artifacts",
  ]);
  expect(result.properties?.cleanup?.additionalProperties).toBe(false);
  expect(Object.keys(result.properties?.cleanup?.properties ?? {})).toEqual([
    "attempted",
    "succeeded",
    "failed",
  ]);
  expect(result.properties?.scope).toMatchObject({
    type: "string",
    enum: ["session", "user"],
  });

  const serializedResult = JSON.stringify(result).toLowerCase();
  for (const forbiddenField of [
    "principalsessionid",
    "useragent",
    "externaltoken",
    "lookup",
    "hmac",
    "metadata",
    "failures",
    "ref",
    "error",
  ]) {
    expect(serializedResult).not.toContain(forbiddenField);
  }
});
