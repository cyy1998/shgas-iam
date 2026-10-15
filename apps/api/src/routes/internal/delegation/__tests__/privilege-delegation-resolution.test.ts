import { expect, test } from "bun:test";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createDelegationHandlers } from "@api/routes/internal/delegation/delegation.handlers";
import { createDelegationRoute } from "@api/routes/internal/delegation/delegation.index";
import type { PrivilegeDelegationResolutionPort } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.port";
import type { ResolvePrivilegeDelegationsInput } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.type";
import { createResolvePrivilegeDelegationsUseCase } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.use-case";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import { ClientStatus } from "@iam/contracts";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import pino, { type Logger } from "pino";
import appConfig from "~api/app.config";

const observedAt = new Date("2026-08-25T08:00:00.000Z");
const enabledClient: GenericClientRuntimeDto = {
  id: 1,
  clientCode: "enabled-client",
  clientName: "Enabled client",
  clientSecret: "enabled-client-secret",
  url: null,
  isDelete: false,
  status: ClientStatus.Enable,
  description: null,
  extAttributes: {},
  createTime: new Date("2026-08-01T00:00:00.000Z"),
  updateTime: new Date("2026-08-01T00:00:00.000Z"),
};
const unavailableResolutionResponse = {
  status: 503,
  body: {
    code: "PRIVILEGE.DELEGATION_RESOLUTION_UNAVAILABLE",
    data: null,
    message: "权限委托解析暂时不可用",
  },
} as const;

function createResolutionApp(
  options: { clock?: { nowDate: () => Date }; logger?: Logger; resolution?: PrivilegeDelegationResolutionPort } = {},
) {
  const resolver = createResolvePrivilegeDelegationsUseCase({
    clock: options.clock ?? { nowDate: () => observedAt },
    resolution: options.resolution ?? {
      async resolveCurrent() {
        throw new Error("pure route validation must not resolve persistence");
      },
    },
  });
  const logger = options.logger ?? pino({ enabled: false });
  const handlers = createDelegationHandlers({
    privilegeDelegationService: {} as never,
    resolvePrivilegeDelegations: resolver,
  });
  const internalAuthenticationHandler = createInternalAuthenticationHandler({
    getClientBySecret: async (secret) => (secret === enabledClient.clientSecret ? enabledClient : null),
  });
  return createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger,
    routes: {
      "./src/routes/internal/delegation/delegation.index.ts": {
        default: createDelegationRoute(handlers),
      },
    },
    middlewares: {
      "./src/routes/internal/_middleware.ts": {
        default: createInternalMiddlewares({ internalAuthenticationHandler }),
      },
    },
  });
}

function createMemoryLogger(lines: Record<string, unknown>[]) {
  return pino(
    { level: "info" },
    {
      write(line: string) {
        lines.push(JSON.parse(line));
      },
    },
  ).child({ sourceApp: "iam-api-test" });
}

async function requestResolution(app: ReturnType<typeof createResolutionApp>, input: unknown) {
  const response = await app.request("http://localhost/internal/delegations/resolve", {
    method: "POST",
    headers: {
      apikey: enabledClient.clientSecret,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("rejects malformed and over-budget request bodies as validation failures", async () => {
  const validInput = {
    usernames: ["alice"],
    orgCode: "ORG",
    privilegeCode: "document:read",
  } satisfies ResolvePrivilegeDelegationsInput;
  const invalidInputs: unknown[] = [
    {},
    { ...validInput, unexpected: true },
    { ...validInput, usernames: "alice" },
    { ...validInput, usernames: [] },
    { ...validInput, usernames: ["alice", "alice"] },
    {
      ...validInput,
      usernames: Array.from({ length: 101 }, (_, index) => `user-${index}`),
    },
    { ...validInput, usernames: [""] },
    { ...validInput, usernames: ["a".repeat(65)] },
    { ...validInput, orgCode: "" },
    { ...validInput, privilegeCode: "" },
    null,
    [],
  ];

  for (const input of invalidInputs) {
    const result = await requestResolution(createResolutionApp(), input);

    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      code: "COMMON.VALIDATION_FAILED",
      message: "请求参数不合法",
    });
  }
});

test("maps persistence, statement, and handler timeouts to one sanitized contract with structured diagnostics", async () => {
  const failures = [
    {
      failureCategory: "persistence-failure",
      error: new Error("connection refused at postgresql://secret@database"),
    },
    {
      failureCategory: "statement-timeout",
      error: Object.assign(new Error("canceling statement due to statement timeout: SELECT secret"), {
        code: "57014",
      }),
    },
  ] as const;

  for (const failure of failures) {
    const logs: Record<string, unknown>[] = [];
    const result = await requestResolution(
      createResolutionApp({
        logger: createMemoryLogger(logs),
        resolution: {
          async resolveCurrent() {
            throw failure.error;
          },
        },
      }),
      {
        usernames: ["alice"],
        orgCode: "ORG",
        privilegeCode: "document:read",
      },
    );

    expect(result).toEqual(unavailableResolutionResponse);
    expect(JSON.stringify(result.body)).not.toContain(failure.error.message);
    expect(logs.find((log) => log.event === "api.error.handled")).toMatchObject({
      statusCode: 503,
      errorCode: "PRIVILEGE.DELEGATION_RESOLUTION_UNAVAILABLE",
      err: {
        diagnostic: {
          failureCategory: failure.failureCategory,
          context: {
            orgCode: "ORG",
            privilegeCode: "document:read",
            usernameCount: 1,
          },
        },
      },
    });
  }

  const handlerLogs: Record<string, unknown>[] = [];
  const handlerTimeoutResult = await requestResolution(
    createResolutionApp({
      logger: createMemoryLogger(handlerLogs),
      resolution: {
        resolveCurrent: () => new Promise(() => {}),
      },
    }),
    {
      usernames: ["alice"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    },
  );

  expect(handlerTimeoutResult).toEqual(unavailableResolutionResponse);
  expect(handlerLogs.find((log) => log.event === "api.error.handled")).toMatchObject({
    statusCode: 503,
    errorCode: "PRIVILEGE.DELEGATION_RESOLUTION_UNAVAILABLE",
    err: {
      diagnostic: {
        failureCategory: "handler-timeout",
        context: {
          orgCode: "ORG",
          privilegeCode: "document:read",
          usernameCount: 1,
        },
      },
    },
  });
}, 10_000);

test("publishes the strict success contract in the Internal OpenAPI document", async () => {
  const response = await createResolutionApp().request("http://localhost/internal/doc");
  const document = (await response.json()) as {
    components: {
      schemas: Record<
        string,
        {
          additionalProperties?: boolean;
          properties?: Record<string, unknown>;
          required?: string[];
          type?: string;
        }
      >;
    };
    paths: Record<
      string,
      {
        post?: {
          requestBody?: {
            content?: Record<string, { schema?: Record<string, unknown> }>;
          };
          responses?: Record<
            string,
            {
              content?: Record<string, { schema?: Record<string, unknown> }>;
            }
          >;
        };
      }
    >;
  };

  expect(response.status).toBe(200);
  expect(document.paths["/internal/delegations/resolve"]?.post?.responses).toHaveProperty("200");
  expect(document.paths["/internal/delegations/resolve"]?.post?.responses).toHaveProperty("404");
  expect(document.paths["/internal/delegations/resolve"]?.post?.responses).toHaveProperty("422");
  expect(document.paths["/internal/delegations/resolve"]?.post?.responses).toHaveProperty("503");
  expect(document.components.schemas.PrivilegeDelegationResolutionRequest).toMatchObject({
    type: "object",
    required: ["usernames", "orgCode", "privilegeCode"],
    additionalProperties: false,
    properties: {
      usernames: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        uniqueItems: true,
        items: { type: "string", minLength: 1, maxLength: 64 },
      },
      orgCode: { type: "string", minLength: 1 },
      privilegeCode: { type: "string", minLength: 1 },
    },
  });
  expect(document.components.schemas.PrivilegeDelegationResolutionInputNotFoundResponse).toMatchObject({
    type: "object",
    required: ["code", "data", "message"],
    additionalProperties: false,
    properties: {
      code: {
        type: "string",
        enum: ["PRIVILEGE.DELEGATION_RESOLUTION_INPUT_NOT_FOUND"],
      },
      data: {
        type: "object",
        required: ["usernames", "orgCodes", "privilegeCodes"],
        additionalProperties: false,
      },
    },
  });
  expect(document.components.schemas.PrivilegeDelegationResolutionResult).toEqual({
    type: "object",
    properties: {
      username: { type: "string", example: "alice" },
      delegateeUsername: {
        type: ["string", "null"],
        example: "bob",
      },
    },
    required: ["username", "delegateeUsername"],
    additionalProperties: false,
  });
  expect(document.components.schemas.PrivilegeDelegationResolutionUnavailableResponse).toMatchObject({
    type: "object",
    required: ["code", "data", "message"],
    additionalProperties: false,
    properties: {
      code: {
        type: "string",
        enum: ["PRIVILEGE.DELEGATION_RESOLUTION_UNAVAILABLE"],
      },
      data: { type: "null" },
    },
  });
});
