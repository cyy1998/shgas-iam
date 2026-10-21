import { expect, test } from "bun:test";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createDelegationHandlers } from "@api/routes/internal/delegation/delegation.handlers";
import { createDelegationRoute } from "@api/routes/internal/delegation/delegation.index";
import type { ClientDelegationResolutionPort } from "@api/use-cases/internal/resolve-client-delegations/resolve-client-delegations.port";
import { createResolveClientDelegationsUseCase } from "@api/use-cases/internal/resolve-client-delegations/resolve-client-delegations.use-case";
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
    code: "CLIENT_DELEGATION.RESOLUTION_UNAVAILABLE",
    data: null,
    message: "委托解析暂时不可用",
  },
} as const;

function createResolutionApp(
  options: { clock?: { nowDate: () => Date }; logger?: Logger; resolution?: ClientDelegationResolutionPort } = {},
) {
  const resolver = createResolveClientDelegationsUseCase({
    clock: options.clock ?? { nowDate: () => observedAt },
    resolution: options.resolution ?? {
      async resolveCurrent() {
        throw new Error("pure route validation must not resolve persistence");
      },
    },
  });
  const logger = options.logger ?? pino({ enabled: false });
  const handlers = createDelegationHandlers({
    delegationService: {} as never,
    resolveClientDelegations: resolver,
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
  };
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

test("resolves the authenticated Client without accepting a target Client or privilege", async () => {
  const queries: unknown[] = [];
  const app = createResolutionApp({
    resolution: {
      async resolveCurrent(query) {
        queries.push(query);
        return {
          results: [{ username: "alice", delegateeUsername: "bob" }],
          missingInputs: { usernames: [], orgCodes: [] },
          integrityViolations: [],
        };
      },
    },
  });
  const result = await requestResolution(app, { usernames: ["alice"], orgCode: "ORG" });
  expect(result.status).toBe(200);
  expect(queries).toEqual([{ usernames: ["alice"], orgCode: "ORG", clientId: 1, observedAt }]);
  const old = await requestResolution(app, { usernames: ["alice"], orgCode: "ORG", privilegeCode: "read" });
  expect(old.status).toBe(422);
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
      },
    );

    expect(result).toEqual(unavailableResolutionResponse);
    expect(JSON.stringify(result.body)).not.toContain(failure.error.message);
    expect(logs.find((log) => log.event === "api.error.handled")).toMatchObject({
      statusCode: 503,
      errorCode: "CLIENT_DELEGATION.RESOLUTION_UNAVAILABLE",
      err: {
        diagnostic: {
          failureCategory: failure.failureCategory,
          context: {
            clientId: 1,
            orgCode: "ORG",
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
    },
  );

  expect(handlerTimeoutResult).toEqual(unavailableResolutionResponse);
  expect(handlerLogs.find((log) => log.event === "api.error.handled")).toMatchObject({
    statusCode: 503,
    errorCode: "CLIENT_DELEGATION.RESOLUTION_UNAVAILABLE",
    err: {
      diagnostic: {
        failureCategory: "handler-timeout",
        context: {
          clientId: 1,
          orgCode: "ORG",
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
  expect(document.components.schemas.DelegationResolutionRequest).toMatchObject({
    type: "object",
    required: ["usernames", "orgCode"],
    additionalProperties: false,
    properties: {
      usernames: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "string", minLength: 1, maxLength: 64 },
      },
      orgCode: { type: "string", minLength: 1 },
    },
  });
  expect(document.components.schemas.ClientDelegationResolutionInputNotFoundResponse).toMatchObject({
    type: "object",
    required: ["code", "data", "message"],
    additionalProperties: false,
    properties: {
      code: {
        type: "string",
        enum: ["CLIENT_DELEGATION.RESOLUTION_INPUT_NOT_FOUND"],
      },
      data: {
        type: "object",
        required: ["usernames", "orgCodes"],
        additionalProperties: false,
      },
    },
  });
  expect(document.components.schemas.ClientDelegationResolutionResult).toEqual({
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
  expect(document.components.schemas.ClientDelegationResolutionUnavailableResponse).toMatchObject({
    type: "object",
    required: ["code", "data", "message"],
    additionalProperties: false,
    properties: {
      code: {
        type: "string",
        enum: ["CLIENT_DELEGATION.RESOLUTION_UNAVAILABLE"],
      },
      data: { type: "null" },
    },
  });
});
