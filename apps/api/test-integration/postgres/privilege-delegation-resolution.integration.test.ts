import type { PrivilegeDelegationResolutionPort } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.port";
import type { ResolvePrivilegeDelegationsInput } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.type";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import type { Logger } from "pino";
import type { ApiPostgresTestHarness } from "./postgres-test-harness";
import {
  createPrivilegeDelegationResolutionRepository,
} from "@api/composition/repositories/privilege-delegation-resolution.repository";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createDelegationHandlers } from "@api/routes/internal/delegation/delegation.handlers";
import { createDelegationRoute } from "@api/routes/internal/delegation/delegation.index";
import {
  createResolvePrivilegeDelegationsUseCase,
} from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.use-case";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import {
  ClientStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PrivilegeDelegationStatus,
  PrivilegeStatus,
  UserStatus,
} from "@iam/contracts";
import {
  delegationDetails,
  organizationClosures,
  organizations,
  privilegeDelegations,
  privileges,
  users,
} from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import pino from "pino";
import appConfig from "~api/app.config";
import { createApiPostgresTestHarness } from "./postgres-test-harness";

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

let harness: ApiPostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

function createResolutionApp(options: {
  clock?: { nowDate: () => Date };
  logger?: Logger;
  resolution?: PrivilegeDelegationResolutionPort;
} = {}) {
  const resolver = createResolvePrivilegeDelegationsUseCase({
    clock: options.clock ?? { nowDate: () => observedAt },
    resolution: options.resolution
      ?? createPrivilegeDelegationResolutionRepository(harness!.db),
  });
  const logger = options.logger ?? pino({ enabled: false });
  const handlers = createDelegationHandlers({
    privilegeDelegationService: {} as never,
    resolvePrivilegeDelegations: resolver,
  });
  const internalAuthenticationHandler = createInternalAuthenticationHandler({
    getClientBySecret: async secret => secret === enabledClient.clientSecret
      ? enabledClient
      : null,
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
  return pino({ level: "info" }, {
    write(line: string) {
      lines.push(JSON.parse(line));
    },
  }).child({ sourceApp: "iam-api-test" });
}

async function requestResolution(
  app: ReturnType<typeof createResolutionApp>,
  input: unknown,
) {
  const response = await app.request(
    "http://localhost/internal/delegations/resolve",
    {
      method: "POST",
      headers: {
        "apikey": enabledClient.clientSecret,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function insertUser(username: string, status = UserStatus.Enable) {
  const [user] = await harness!.db.insert(users).values({
    username,
    name: username,
    status,
  }).returning({ id: users.id });
  return user!.id;
}

async function insertOrganization(input: {
  code: string;
  level?: OrganizationLevel;
  parentId?: number;
  status?: OrganizationStatus;
}) {
  const [organization] = await harness!.db.insert(organizations).values({
    orgCode: input.code,
    orgName: input.code,
    parentId: input.parentId,
    path: input.code,
    level: input.level ?? OrganizationLevel.One,
    orgType: OrganizationType.Company,
    status: input.status,
  }).returning({ id: organizations.id });
  await harness!.db.insert(organizationClosures).values({
    ancestorId: organization!.id,
    descendantId: organization!.id,
    depth: 0,
  });
  return organization!.id;
}

async function insertPrivilege(
  code: string,
  status = PrivilegeStatus.Enable,
) {
  const [privilege] = await harness!.db.insert(privileges).values({
    privilegeCode: code,
    privilegeName: code,
    status,
  }).returning({ id: privileges.id });
  return privilege!.id;
}

async function insertDelegation(input: {
  delegatorUserId: number;
  delegateeUserId: number;
  organizationScopeId: number;
  privilegeIds: number[];
  startTime?: Date;
  endTime?: Date;
  status?: PrivilegeDelegationStatus;
  isDelete?: boolean;
}) {
  const [delegation] = await harness!.db.insert(privilegeDelegations).values({
    delegatorUserId: input.delegatorUserId,
    delegateeUserId: input.delegateeUserId,
    organizationScopeId: input.organizationScopeId,
    startTime: input.startTime ?? new Date("2026-08-24T08:00:00.000Z"),
    endTime: input.endTime ?? new Date("2026-08-26T08:00:00.000Z"),
    status: input.status ?? PrivilegeDelegationStatus.Enable,
    isDelete: input.isDelete,
  }).returning({ id: privilegeDelegations.id });
  await harness!.db.insert(delegationDetails).values(
    input.privilegeIds.map(privilegeId => ({
      delegationId: delegation!.id,
      privilegeId,
    })),
  );
  return delegation!.id;
}

describe("POST /internal/delegations/resolve", () => {
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

  test("rejects the whole batch with every unrecognized input grouped by kind", async () => {
    await insertUser("alice");
    const deletedUser = await insertUser("deleted-user");
    const deletedOrganization = await insertOrganization({ code: "deleted-org" });
    const deletedPrivilege = await insertPrivilege("deleted:privilege");
    await harness!.db.update(users)
      .set({ isDelete: true })
      .where(eq(users.id, deletedUser));
    await harness!.db.update(organizations)
      .set({ isDelete: true })
      .where(eq(organizations.id, deletedOrganization));
    await harness!.db.update(privileges)
      .set({ isDelete: true })
      .where(eq(privileges.id, deletedPrivilege));

    const result = await requestResolution(createResolutionApp(), {
      usernames: ["missing-user", "alice", "deleted-user"],
      orgCode: "deleted-org",
      privilegeCode: "deleted:privilege",
    });

    expect(result).toEqual({
      status: 404,
      body: {
        code: "PRIVILEGE.DELEGATION_RESOLUTION_INPUT_NOT_FOUND",
        data: {
          usernames: ["missing-user", "deleted-user"],
          orgCodes: ["deleted-org"],
          privilegeCodes: ["deleted:privilege"],
        },
        message: "权限委托解析输入无法识别",
      },
    });
  });

  test("recognizes identifiers exactly without trimming or case folding", async () => {
    await insertUser("alice");
    await insertOrganization({ code: "ORG" });
    await insertPrivilege("document:read");

    const usernameResult = await requestResolution(createResolutionApp(), {
      usernames: [" alice"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    });
    const organizationResult = await requestResolution(createResolutionApp(), {
      usernames: ["alice"],
      orgCode: "org",
      privilegeCode: "document:read",
    });
    const privilegeResult = await requestResolution(createResolutionApp(), {
      usernames: ["alice"],
      orgCode: "ORG",
      privilegeCode: "DOCUMENT:READ ",
    });

    expect(usernameResult).toMatchObject({
      status: 404,
      body: {
        code: "PRIVILEGE.DELEGATION_RESOLUTION_INPUT_NOT_FOUND",
        data: { usernames: [" alice"], orgCodes: [], privilegeCodes: [] },
      },
    });
    expect(organizationResult).toMatchObject({
      status: 404,
      body: {
        code: "PRIVILEGE.DELEGATION_RESOLUTION_INPUT_NOT_FOUND",
        data: { usernames: [], orgCodes: ["org"], privilegeCodes: [] },
      },
    });
    expect(privilegeResult).toMatchObject({
      status: 404,
      body: {
        code: "PRIVILEGE.DELEGATION_RESOLUTION_INPUT_NOT_FOUND",
        data: {
          usernames: [],
          orgCodes: [],
          privilegeCodes: ["DOCUMENT:READ "],
        },
      },
    });
  });

  test("preserves input order while returning a direct delegatee or null", async () => {
    const [alice, bob] = await harness!.db.insert(users).values([
      { username: "alice", name: "Alice" },
      { username: "bob", name: "Bob" },
      { username: "carol", name: "Carol" },
    ]).returning({ id: users.id, username: users.username });
    const [organization] = await harness!.db.insert(organizations).values({
      orgCode: "ORG",
      orgName: "Organization",
      path: "ORG",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    }).returning({ id: organizations.id });
    await harness!.db.insert(organizationClosures).values({
      ancestorId: organization!.id,
      descendantId: organization!.id,
      depth: 0,
    });
    const [privilege] = await harness!.db.insert(privileges).values({
      privilegeCode: "document:read",
      privilegeName: "Read documents",
    }).returning({ id: privileges.id });
    const [delegation] = await harness!.db.insert(privilegeDelegations).values({
      delegatorUserId: alice!.id,
      delegateeUserId: bob!.id,
      organizationScopeId: organization!.id,
      startTime: new Date("2026-08-24T08:00:00.000Z"),
      endTime: new Date("2026-08-26T08:00:00.000Z"),
      status: PrivilegeDelegationStatus.Enable,
    }).returning({ id: privilegeDelegations.id });
    await harness!.db.insert(delegationDetails).values({
      delegationId: delegation!.id,
      privilegeId: privilege!.id,
    });

    const result = await requestResolution(createResolutionApp(), {
      usernames: ["carol", "alice"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    });

    expect(result).toEqual({
      status: 200,
      body: {
        code: 200,
        data: [
          { username: "carol", delegateeUsername: null },
          { username: "alice", delegateeUsername: "bob" },
        ],
        message: "success",
      },
    });
  });

  test("matches exact and ancestor scopes without widening descendant or unrelated scopes", async () => {
    const delegatee = await insertUser("delegatee");
    const ancestorScoped = await insertUser("ancestor-scoped");
    const exactScoped = await insertUser("exact-scoped");
    const descendantScoped = await insertUser("descendant-scoped");
    const unrelatedScoped = await insertUser("unrelated-scoped");
    const root = await insertOrganization({ code: "ROOT" });
    const child = await insertOrganization({
      code: "CHILD",
      level: OrganizationLevel.Two,
      parentId: root,
    });
    const unrelated = await insertOrganization({ code: "UNRELATED" });
    await harness!.db.insert(organizationClosures).values({
      ancestorId: root,
      descendantId: child,
      depth: 1,
    });
    const privilege = await insertPrivilege("document:read");
    await insertDelegation({
      delegatorUserId: ancestorScoped,
      delegateeUserId: delegatee,
      organizationScopeId: root,
      privilegeIds: [privilege],
    });
    await insertDelegation({
      delegatorUserId: exactScoped,
      delegateeUserId: delegatee,
      organizationScopeId: child,
      privilegeIds: [privilege],
    });
    await insertDelegation({
      delegatorUserId: descendantScoped,
      delegateeUserId: delegatee,
      organizationScopeId: child,
      privilegeIds: [privilege],
    });
    await insertDelegation({
      delegatorUserId: unrelatedScoped,
      delegateeUserId: delegatee,
      organizationScopeId: unrelated,
      privilegeIds: [privilege],
    });
    const app = createResolutionApp();

    const childResult = await requestResolution(app, {
      usernames: ["ancestor-scoped", "exact-scoped", "unrelated-scoped"],
      orgCode: "CHILD",
      privilegeCode: "document:read",
    });
    const rootResult = await requestResolution(app, {
      usernames: ["descendant-scoped"],
      orgCode: "ROOT",
      privilegeCode: "document:read",
    });

    expect([childResult, rootResult]).toEqual([
      {
        status: 200,
        body: {
          code: 200,
          data: [
            { username: "ancestor-scoped", delegateeUsername: "delegatee" },
            { username: "exact-scoped", delegateeUsername: "delegatee" },
            { username: "unrelated-scoped", delegateeUsername: null },
          ],
          message: "success",
        },
      },
      {
        status: 200,
        body: {
          code: 200,
          data: [
            { username: "descendant-scoped", delegateeUsername: null },
          ],
          message: "success",
        },
      },
    ]);
  });

  test("uses a closed validity interval and excludes inactive or deleted delegations", async () => {
    const usernames = [
      "at-start",
      "at-end",
      "before-start",
      "after-end",
      "paused",
      "disabled",
      "deleted",
    ];
    const userIds = new Map<string, number>();
    for (const username of usernames)
      userIds.set(username, await insertUser(username));
    const delegatee = await insertUser("delegatee");
    const organization = await insertOrganization({ code: "ORG" });
    const privilege = await insertPrivilege("document:read");
    const common = {
      delegateeUserId: delegatee,
      organizationScopeId: organization,
      privilegeIds: [privilege],
    };
    await insertDelegation({
      ...common,
      delegatorUserId: userIds.get("at-start")!,
      startTime: observedAt,
    });
    await insertDelegation({
      ...common,
      delegatorUserId: userIds.get("at-end")!,
      endTime: observedAt,
    });
    await insertDelegation({
      ...common,
      delegatorUserId: userIds.get("before-start")!,
      startTime: new Date("2026-08-25T08:00:00.001Z"),
    });
    await insertDelegation({
      ...common,
      delegatorUserId: userIds.get("after-end")!,
      endTime: new Date("2026-08-25T07:59:59.999Z"),
    });
    await insertDelegation({
      ...common,
      delegatorUserId: userIds.get("paused")!,
      status: PrivilegeDelegationStatus.Pause,
    });
    await insertDelegation({
      ...common,
      delegatorUserId: userIds.get("disabled")!,
      status: PrivilegeDelegationStatus.Disable,
    });
    await insertDelegation({
      ...common,
      delegatorUserId: userIds.get("deleted")!,
      isDelete: true,
    });

    const result = await requestResolution(createResolutionApp(), {
      usernames,
      orgCode: "ORG",
      privilegeCode: "document:read",
    });

    expect(result).toEqual({
      status: 200,
      body: {
        code: 200,
        data: [
          { username: "at-start", delegateeUsername: "delegatee" },
          { username: "at-end", delegateeUsername: "delegatee" },
          { username: "before-start", delegateeUsername: null },
          { username: "after-end", delegateeUsername: null },
          { username: "paused", delegateeUsername: null },
          { username: "disabled", delegateeUsername: null },
          { username: "deleted", delegateeUsername: null },
        ],
        message: "success",
      },
    });
  });

  test("recognizes paused or disabled references without recomputing authorization", async () => {
    const delegator = await insertUser("paused-delegator", UserStatus.Pause);
    await insertUser(
      "disabled-without-delegation",
      UserStatus.Disable,
    );
    const delegatee = await insertUser("disabled-delegatee", UserStatus.Disable);
    const organization = await insertOrganization({
      code: "PAUSED-ORG",
      status: OrganizationStatus.Pause,
    });
    const requestedPrivilege = await insertPrivilege(
      "document:read",
      PrivilegeStatus.Disable,
    );
    const otherPrivilege = await insertPrivilege("document:write");
    await insertDelegation({
      delegatorUserId: delegator,
      delegateeUserId: delegatee,
      organizationScopeId: organization,
      privilegeIds: [otherPrivilege, requestedPrivilege],
    });

    const result = await requestResolution(createResolutionApp(), {
      usernames: ["paused-delegator", "disabled-without-delegation"],
      orgCode: "PAUSED-ORG",
      privilegeCode: "document:read",
    });

    expect(result).toEqual({
      status: 200,
      body: {
        code: 200,
        data: [
          {
            username: "paused-delegator",
            delegateeUsername: "disabled-delegatee",
          },
          {
            username: "disabled-without-delegation",
            delegateeUsername: null,
          },
        ],
        message: "success",
      },
    });
  });

  test("returns direct edges for chains and two-way cycles", async () => {
    const alice = await insertUser("alice");
    const bob = await insertUser("bob");
    const carol = await insertUser("carol");
    const dave = await insertUser("dave");
    const erin = await insertUser("erin");
    const organization = await insertOrganization({ code: "ORG" });
    const privilege = await insertPrivilege("document:read");
    const common = {
      organizationScopeId: organization,
      privilegeIds: [privilege],
    };
    await insertDelegation({
      ...common,
      delegatorUserId: alice,
      delegateeUserId: bob,
    });
    await insertDelegation({
      ...common,
      delegatorUserId: bob,
      delegateeUserId: carol,
    });
    await insertDelegation({
      ...common,
      delegatorUserId: dave,
      delegateeUserId: erin,
    });
    await insertDelegation({
      ...common,
      delegatorUserId: erin,
      delegateeUserId: dave,
    });

    const result = await requestResolution(createResolutionApp(), {
      usernames: ["alice", "dave", "erin"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    });

    expect(result).toEqual({
      status: 200,
      body: {
        code: 200,
        data: [
          { username: "alice", delegateeUsername: "bob" },
          { username: "dave", delegateeUsername: "erin" },
          { username: "erin", delegateeUsername: "dave" },
        ],
        message: "success",
      },
    });
  });

  test("fails the whole batch when duplicate matching delegations identify different delegatees", async () => {
    const logs: Record<string, unknown>[] = [];
    const valid = await insertUser("valid");
    const ambiguous = await insertUser("ambiguous");
    const firstDelegatee = await insertUser("first-delegatee");
    const secondDelegatee = await insertUser("second-delegatee");
    const organization = await insertOrganization({ code: "ORG" });
    const privilege = await insertPrivilege("document:read");
    const common = {
      organizationScopeId: organization,
      privilegeIds: [privilege],
    };
    await insertDelegation({
      ...common,
      delegatorUserId: valid,
      delegateeUserId: firstDelegatee,
    });
    const firstAmbiguousDelegation = await insertDelegation({
      ...common,
      delegatorUserId: ambiguous,
      delegateeUserId: firstDelegatee,
    });
    const secondAmbiguousDelegation = await insertDelegation({
      ...common,
      delegatorUserId: ambiguous,
      delegateeUserId: secondDelegatee,
    });
    const result = await requestResolution(createResolutionApp({
      logger: createMemoryLogger(logs),
    }), {
      usernames: ["valid", "ambiguous"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    });

    expect(result).toEqual(unavailableResolutionResponse);
    expect(JSON.stringify(result.body)).not.toContain("first-delegatee");
    expect(JSON.stringify(result.body)).not.toContain("second-delegatee");
    expect(JSON.stringify(result.body)).not.toContain("ambiguous-delegation");
    expect(JSON.stringify(result.body)).not.toContain("delegationIds");
    expect(logs.find(log => log.event === "api.error.handled"))
      .toMatchObject({
        err: {
          diagnostic: {
            failureCategory: "integrity-violation",
            violations: expect.arrayContaining([
              {
                category: "ambiguous-delegation",
                username: "ambiguous",
                delegationIds: [
                  firstAmbiguousDelegation,
                  secondAmbiguousDelegation,
                ],
              },
            ]),
          },
        },
      });
  });

  test("fails closed when duplicate matching delegations identify the same delegatee", async () => {
    const delegator = await insertUser("delegator");
    const delegatee = await insertUser("delegatee");
    const organization = await insertOrganization({ code: "ORG" });
    const privilege = await insertPrivilege("document:read");
    const common = {
      delegatorUserId: delegator,
      delegateeUserId: delegatee,
      organizationScopeId: organization,
      privilegeIds: [privilege],
    };
    await insertDelegation(common);
    await insertDelegation(common);

    const result = await requestResolution(createResolutionApp(), {
      usernames: ["delegator"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    });

    expect(result).toEqual(unavailableResolutionResponse);
  });

  test("fails closed for a matching self-delegation", async () => {
    const alice = await insertUser("alice");
    const organization = await insertOrganization({ code: "ORG" });
    const privilege = await insertPrivilege("document:read");
    await insertDelegation({
      delegatorUserId: alice,
      delegateeUserId: alice,
      organizationScopeId: organization,
      privilegeIds: [privilege],
    });

    const result = await requestResolution(createResolutionApp(), {
      usernames: ["alice"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    });

    expect(result).toEqual(unavailableResolutionResponse);
  });

  test("fails closed for every dangling or soft-deleted reference on a matching delegation", async () => {
    const requestedOrganization = await insertOrganization({ code: "ORG" });
    const requestedPrivilege = await insertPrivilege("document:read");
    const validDelegatee = await insertUser("valid-delegatee");
    const deletedDelegatee = await insertUser("deleted-delegatee");
    const deletedScope = await insertOrganization({ code: "DELETED-SCOPE" });
    const deletedPrivilege = await insertPrivilege("deleted:privilege");
    await harness!.db.update(users)
      .set({ isDelete: true })
      .where(eq(users.id, deletedDelegatee));
    await harness!.db.update(organizations)
      .set({ isDelete: true })
      .where(eq(organizations.id, deletedScope));
    await harness!.db.update(privileges)
      .set({ isDelete: true })
      .where(eq(privileges.id, deletedPrivilege));

    const missingDelegatee = await insertUser("missing-delegatee-reference");
    const deletedDelegateeReference = await insertUser("deleted-delegatee-reference");
    const missingScopeReference = await insertUser("missing-scope-reference");
    const deletedScopeReference = await insertUser("deleted-scope-reference");
    const missingPrivilegeReference = await insertUser("missing-privilege-reference");
    const deletedPrivilegeReference = await insertUser("deleted-privilege-reference");
    const missingUserId = 90_001;
    const missingScopeId = 90_002;
    const missingPrivilegeId = 90_003;
    await harness!.db.insert(organizationClosures).values([
      {
        ancestorId: missingScopeId,
        descendantId: requestedOrganization,
        depth: 1,
      },
      {
        ancestorId: deletedScope,
        descendantId: requestedOrganization,
        depth: 1,
      },
    ]);
    await insertDelegation({
      delegatorUserId: missingDelegatee,
      delegateeUserId: missingUserId,
      organizationScopeId: requestedOrganization,
      privilegeIds: [requestedPrivilege],
    });
    await insertDelegation({
      delegatorUserId: deletedDelegateeReference,
      delegateeUserId: deletedDelegatee,
      organizationScopeId: requestedOrganization,
      privilegeIds: [requestedPrivilege],
    });
    await insertDelegation({
      delegatorUserId: missingScopeReference,
      delegateeUserId: validDelegatee,
      organizationScopeId: missingScopeId,
      privilegeIds: [requestedPrivilege],
    });
    await insertDelegation({
      delegatorUserId: deletedScopeReference,
      delegateeUserId: validDelegatee,
      organizationScopeId: deletedScope,
      privilegeIds: [requestedPrivilege],
    });
    await insertDelegation({
      delegatorUserId: missingPrivilegeReference,
      delegateeUserId: validDelegatee,
      organizationScopeId: requestedOrganization,
      privilegeIds: [requestedPrivilege, missingPrivilegeId],
    });
    await insertDelegation({
      delegatorUserId: deletedPrivilegeReference,
      delegateeUserId: validDelegatee,
      organizationScopeId: requestedOrganization,
      privilegeIds: [requestedPrivilege, deletedPrivilege],
    });

    for (const username of [
      "missing-delegatee-reference",
      "deleted-delegatee-reference",
      "missing-scope-reference",
      "deleted-scope-reference",
      "missing-privilege-reference",
      "deleted-privilege-reference",
    ]) {
      const result = await requestResolution(createResolutionApp(), {
        usernames: [username],
        orgCode: "ORG",
        privilegeCode: "document:read",
      });

      expect(result).toEqual(unavailableResolutionResponse);
      expect(JSON.stringify(result.body)).not.toContain(username);
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
        error: Object.assign(
          new Error("canceling statement due to statement timeout: SELECT secret"),
          { code: "57014" },
        ),
      },
    ] as const;

    for (const failure of failures) {
      const logs: Record<string, unknown>[] = [];
      const result = await requestResolution(createResolutionApp({
        logger: createMemoryLogger(logs),
        resolution: {
          async resolveCurrent() {
            throw failure.error;
          },
        },
      }), {
        usernames: ["alice"],
        orgCode: "ORG",
        privilegeCode: "document:read",
      });

      expect(result).toEqual(unavailableResolutionResponse);
      expect(JSON.stringify(result.body)).not.toContain(failure.error.message);
      expect(logs.find(log => log.event === "api.error.handled"))
        .toMatchObject({
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
    const handlerTimeoutResult = await requestResolution(createResolutionApp({
      logger: createMemoryLogger(handlerLogs),
      resolution: {
        resolveCurrent: () => new Promise(() => {}),
      },
    }), {
      usernames: ["alice"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    });

    expect(handlerTimeoutResult).toEqual(unavailableResolutionResponse);
    expect(handlerLogs.find(log => log.event === "api.error.handled"))
      .toMatchObject({
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

  test("observes the entire batch at one server-owned instant", async () => {
    const alice = await insertUser("alice");
    const bob = await insertUser("bob");
    const delegatee = await insertUser("delegatee");
    const organization = await insertOrganization({ code: "ORG" });
    const privilege = await insertPrivilege("document:read");
    const common = {
      delegateeUserId: delegatee,
      organizationScopeId: organization,
      privilegeIds: [privilege],
    };
    await insertDelegation({
      ...common,
      delegatorUserId: alice,
      startTime: new Date("2026-08-25T07:30:00.000Z"),
      endTime: new Date("2026-08-25T08:30:00.000Z"),
    });
    await insertDelegation({
      ...common,
      delegatorUserId: bob,
      startTime: new Date("2026-08-25T09:30:00.000Z"),
      endTime: new Date("2026-08-25T10:30:00.000Z"),
    });
    const observationTimes = [
      new Date("2026-08-25T08:00:00.000Z"),
      new Date("2026-08-25T10:00:00.000Z"),
    ];
    const app = createResolutionApp({
      clock: {
        nowDate: () => observationTimes.shift()
          ?? new Date("2026-08-25T10:00:00.000Z"),
      },
    });

    const result = await requestResolution(app, {
      usernames: ["alice", "bob"],
      orgCode: "ORG",
      privilegeCode: "document:read",
    });

    expect(result).toEqual({
      status: 200,
      body: {
        code: 200,
        data: [
          { username: "alice", delegateeUsername: "delegatee" },
          { username: "bob", delegateeUsername: null },
        ],
        message: "success",
      },
    });
  });

  test("publishes the strict success contract in the Internal OpenAPI document", async () => {
    const response = await createResolutionApp().request(
      "http://localhost/internal/doc",
    );
    const document = await response.json() as {
      components: {
        schemas: Record<string, {
          additionalProperties?: boolean;
          properties?: Record<string, unknown>;
          required?: string[];
          type?: string;
        }>;
      };
      paths: Record<string, {
        post?: {
          requestBody?: {
            content?: Record<string, { schema?: Record<string, unknown> }>;
          };
          responses?: Record<string, {
            content?: Record<string, { schema?: Record<string, unknown> }>;
          }>;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(document.paths["/internal/delegations/resolve"]?.post?.responses)
      .toHaveProperty("200");
    expect(document.paths["/internal/delegations/resolve"]?.post?.responses)
      .toHaveProperty("404");
    expect(document.paths["/internal/delegations/resolve"]?.post?.responses)
      .toHaveProperty("422");
    expect(document.paths["/internal/delegations/resolve"]?.post?.responses)
      .toHaveProperty("503");
    expect(document.components.schemas.PrivilegeDelegationResolutionRequest)
      .toMatchObject({
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
    expect(document.components.schemas
      .PrivilegeDelegationResolutionInputNotFoundResponse).toMatchObject({
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
    expect(document.components.schemas.PrivilegeDelegationResolutionResult)
      .toEqual({
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
    expect(document.components.schemas
      .PrivilegeDelegationResolutionUnavailableResponse).toMatchObject({
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
});
