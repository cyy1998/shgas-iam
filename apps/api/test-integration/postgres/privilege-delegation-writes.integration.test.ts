import type { PrivilegeDelegationCreateDto } from "@api/services/privilege/privilegeDelegation.type";
import type { DbClient } from "@iam/db";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import type { ApiPostgresTestHarness } from "./postgres-test-harness";
import { createApiRepositories } from "@api/composition/repositories";
import { createPrivilegeDelegationResolutionRepository } from "@api/composition/repositories/privilege-delegation-resolution.repository";
import { createApiUnitOfWork } from "@api/composition/tx";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createDelegationHandlers } from "@api/routes/internal/delegation/delegation.handlers";
import { createDelegationRoute } from "@api/routes/internal/delegation/delegation.index";
import { createPrivilegeDelegationService } from "@api/services/privilege/privilegeDelegation.service";
import { createResolvePrivilegeDelegationsUseCase } from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.use-case";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { ClientStatus, OrganizationLevel, OrganizationType, PrivilegeDelegationStatus } from "@iam/contracts";
import {
  auditLogs,
  delegationDetails,
  organizationClosures,
  organizations,
  privilegeDelegations,
  privileges,
  users,
} from "@iam/db/schema";
import { PrivilegeAlreadyDelegatedError, PrivilegeDelegationEndedError } from "@iam/domain/privilege";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import appConfig from "~api/app.config";
import { createApiPostgresTestHarness } from "./postgres-test-harness";

const startTime = new Date("2026-09-01T00:00:00Z");
const endTime = new Date("2026-09-10T00:00:00Z");
const observedAt = new Date("2026-09-05T00:00:00Z");
const context = {
  actor: {
    actorType: "client" as const,
    actorUserId: null,
    actorUsername: null,
    actorClientCode: "delegation-contract",
    actorSystemKey: null,
  },
  requestContext: {
    sourceApp: "iam",
    requestId: "delegation-contract-request",
    traceId: null,
    ip: null,
    userAgent: null,
    route: "/internal/delegations",
    method: "POST",
  },
};

let harness: ApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
  await harness.db
    .insert(users)
    .values(["alice", "bob", "carol"].map(username => ({ username, name: username })));
  const rows = await harness.db
    .insert(organizations)
    .values([
      {
        orgCode: "ROOT",
        orgName: "ROOT",
        path: "ROOT",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
      },
      {
        orgCode: "LEFT",
        orgName: "LEFT",
        path: "ROOT/LEFT",
        level: OrganizationLevel.Two,
        orgType: OrganizationType.Company,
        parentId: 1,
      },
      {
        orgCode: "RIGHT",
        orgName: "RIGHT",
        path: "ROOT/RIGHT",
        level: OrganizationLevel.Two,
        orgType: OrganizationType.Company,
        parentId: 1,
      },
      {
        orgCode: "OTHER",
        orgName: "OTHER",
        path: "OTHER",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
      },
    ])
    .returning();
  await harness.db
    .insert(organizationClosures)
    .values([
      ...rows.map(row => ({ ancestorId: row.id, descendantId: row.id, depth: 0 })),
      { ancestorId: 1, descendantId: 2, depth: 1 },
      { ancestorId: 1, descendantId: 3, depth: 1 },
    ]);
  await harness.db
    .insert(privileges)
    .values(["read", "write"].map(code => ({ privilegeCode: code, privilegeName: code })));
});
afterAll(async () => {
  await harness?.close();
});

function input(overrides: Partial<PrivilegeDelegationCreateDto> = {}): PrivilegeDelegationCreateDto {
  return {
    delegatorUsername: "alice",
    delegateeUsername: "bob",
    orgCode: "LEFT",
    privilegeCodes: ["read"],
    startTime,
    endTime,
    ...overrides,
  };
}

function createService(db = harness.db) {
  const uow = createApiUnitOfWork({
    db,
    logger: { error() {}, warn() {} },
    clock: { nowDate: () => observedAt },
    userProfileJobProducer: {
      async enqueueRebuildJobs() {
        return { enqueued: 0, jobIds: [] };
      },
    },
  });
  return createPrivilegeDelegationService({
    privilegeDelegationRepository: createApiRepositories(db).privilegeDelegation,
    uow: mapUnitOfWork(uow, tx => ({
      userRepository: tx.repositories.user,
      organizationRepository: tx.repositories.organization,
      privilegeRepository: tx.repositories.privilege,
      privilegeDelegationRepository: tx.repositories.privilegeDelegation,
      auditLogWriter: tx.auditLogWriter,
    })),
  });
}

async function failure(operation: Promise<unknown>) {
  try {
    await operation;
    return undefined;
  }
  catch (error) {
    return error;
  }
}

async function persisted() {
  return {
    delegations: await harness.db.select().from(privilegeDelegations).orderBy(privilegeDelegations.id),
    details: await harness.db
      .select()
      .from(delegationDetails)
      .orderBy(delegationDetails.delegationId, delegationDetails.privilegeId),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
  };
}

// Both production UoWs enter separate real transactions before either command proceeds.
function concurrentService() {
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    release = resolve;
  });
  const identities: { pid: number; transactionId: string }[] = [];
  let lockObservation: Promise<void>;
  const db: DbClient = Object.create(harness.db);
  db.transaction = async (callback, options) =>
    harness.db.transaction(async (tx) => {
      const rows = await tx.execute<{ pid: number; transactionId: string }>(
        sql`select pg_backend_pid() as pid, txid_current()::text as "transactionId"`,
      );
      identities.push(rows[0]!);
      if (identities.length === 2) {
        lockObservation = observeLockWait();
        release();
      }
      await entered;
      try {
        return await callback(tx);
      }
      finally {
        await lockObservation;
      }
    }, options);
  async function observeLockWait() {
    const deadline = Date.now() + 3000;
    let blocked = false;
    while (Date.now() < deadline) {
      const waiting = await harness.sql<{ blocked: boolean }[]>`
          select exists (
            select 1 from pg_stat_activity
            where pid = any(${identities.map(row => row.pid)})
              and pg_blocking_pids(pid) && ${identities.map(row => row.pid)}::integer[]
          ) as blocked`;
      if (waiting[0]!.blocked) {
        blocked = true;
        break;
      }
    }
    if (!blocked)
      throw new Error("Expected the competing PostgreSQL transaction to wait for the command's row lock");
  }
  return { service: createService(db), identities };
}

function expectIndependentTransactions(identities: { pid: number; transactionId: string }[]) {
  expect(identities).toHaveLength(2);
  expect(new Set(identities.map(row => row.pid)).size).toBe(2);
  expect(new Set(identities.map(row => row.transactionId)).size).toBe(2);
}

describe("Privilege Delegation production PostgreSQL writes", () => {
  test("HTTP writes preserve response shapes, reject immutable fields, and persist authenticated audit context", async () => {
    const handlers = createDelegationHandlers({
      privilegeDelegationService: createService(),
      resolvePrivilegeDelegations: createResolvePrivilegeDelegationsUseCase({
        clock: { nowDate: () => observedAt },
        resolution: createPrivilegeDelegationResolutionRepository(harness.db),
      }),
    });
    const app = createApp(appConfig, {
      env: { NODE_ENV: "test" },
      logger: pino({ enabled: false }),
      routes: {
        "./src/routes/internal/delegation/delegation.index.ts": { default: createDelegationRoute(handlers) },
      },
      middlewares: {
        "./src/routes/internal/_middleware.ts": {
          default: createInternalMiddlewares({
            internalAuthenticationHandler: createInternalAuthenticationHandler({
              getClientBySecret: async (secret): Promise<GenericClientRuntimeDto | null> =>
                secret === "contract-secret"
                  ? {
                      id: 1,
                      clientCode: "delegation-contract",
                      clientName: "Contract",
                      clientSecret: "contract-secret",
                      status: ClientStatus.Enable,
                      isDelete: false,
                      description: null,
                      extAttributes: {},
                      url: null,
                      createTime: startTime,
                      updateTime: startTime,
                    }
                  : null,
            }),
          }),
        },
      },
    });
    async function request(method: string, path: string, body: unknown) {
      const response = await app.request(`http://localhost/internal/delegations${path}`, {
        method,
        headers: {
          "apikey": "contract-secret",
          "Client": "delegation-contract",
          "content-type": "application/json",
          "x-request-id": "http-delegation-request",
          "user-agent": "delegation-contract-test",
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    const created = await request("POST", "", input());
    expect(created).toMatchObject({
      status: 200,
      body: {
        code: 200,
        data: {
          delegatorUsername: "alice",
          delegateeUsername: "bob",
          status: PrivilegeDelegationStatus.Enable,
        },
      },
    });
    const state = await persisted();
    const id = state.delegations[0]!.id;
    const updated = await request("PATCH", `/${id}`, { description: "HTTP edit" });
    expect(updated).toMatchObject({ status: 200, body: { code: 200, data: true } });
    for (const body of [
      { delegateeUsername: "carol" },
      { organizationScopeId: 4 },
      { privilegeCodes: ["write"] },
      { delegatorUserId: 3 },
    ]) {
      const rejected = await request("PATCH", `/${id}`, body);
      expect(rejected.status).toBe(422);
    }
    const emptyUpdate = await request("PATCH", `/${id}`, {});
    expect(emptyUpdate).toMatchObject({ status: 400, body: { code: "COMMON.BAD_REQUEST" } });
    const finalState = await persisted();
    expect(finalState.delegations[0]).toMatchObject({
      delegateeUserId: 2,
      delegatorUserId: 1,
      organizationScopeId: 2,
      description: "HTTP edit",
    });
    expect(finalState.audits).toHaveLength(2);
    for (const event of finalState.audits) {
      expect(event).toMatchObject({
        actorType: "client",
        actorClientCode: "delegation-contract",
        targetId: id,
        requestId: "http-delegation-request",
        sourceApp: "iam",
        userAgent: "delegation-contract-test",
        outcome: "success",
      });
    }
    expect(finalState.audits.map(event => event.method)).toEqual(["POST", "PATCH"]);
    const selfDelegation = await request("POST", "", input({ delegateeUsername: "alice" }));
    const invalidPeriod = await request("PATCH", `/${id}`, { startTime: endTime });
    for (const result of [selfDelegation, invalidPeriod])
      expect(result).toMatchObject({ status: 400, body: { code: "COMMON.BAD_REQUEST" } });
    const afterInvalidRequests = await persisted();
    expect(afterInvalidRequests).toEqual(finalState);
  });

  test.each([
    ["same organization", "LEFT", "LEFT"],
    ["ancestor to descendant", "ROOT", "LEFT"],
    ["descendant to ancestor", "LEFT", "ROOT"],
  ])("rejects overlapping privilege/time/scope: %s", async (_name, firstScope, secondScope) => {
    const service = createService();
    await service.createPrivilegeDelegation(input({ orgCode: firstScope }), context);
    const before = await persisted();
    const error = await failure(service.createPrivilegeDelegation(input({ orgCode: secondScope }), context));
    const after = await persisted();
    expect(error).toBeInstanceOf(PrivilegeAlreadyDelegatedError);
    expect(after).toEqual(before);
  });

  test.each([
    ["sibling organizations", { orgCode: "RIGHT" }],
    ["independent tree", { orgCode: "OTHER" }],
    ["different privileges", { privilegeCodes: ["write"] }],
    [
      "disjoint time",
      { startTime: new Date("2026-09-11T00:00:00Z"), endTime: new Date("2026-09-12T00:00:00Z") },
    ],
  ] satisfies [string, Partial<PrivilegeDelegationCreateDto>][])(
    "allows coexistence for %s",
    async (_name, partialInput) => {
      const overrides: Partial<PrivilegeDelegationCreateDto> = partialInput;
      const service = createService();
      await service.createPrivilegeDelegation(input(), context);
      await service.createPrivilegeDelegation(input({ ...overrides, delegateeUsername: "carol" }), context);
      const state = await persisted();
      expect(state.delegations).toHaveLength(2);
      expect(state.audits).toHaveLength(2);
      const resolver = createResolvePrivilegeDelegationsUseCase({
        clock: { nowDate: () => observedAt },
        resolution: createPrivilegeDelegationResolutionRepository(harness.db),
      });
      for (const orgCode of ["ROOT", "LEFT", "RIGHT", "OTHER"]) {
        for (const privilegeCode of ["read", "write"]) {
          const result = await resolver.execute({ usernames: ["alice"], orgCode, privilegeCode });
          const expected
            = orgCode === "LEFT" && privilegeCode === "read"
              ? "bob"
              : orgCode === (overrides.orgCode ?? "LEFT")
                && privilegeCode === (overrides.privilegeCodes?.[0] ?? "read")
                && !overrides.startTime
                ? "carol"
                : null;
          expect(result).toEqual([{ username: "alice", delegateeUsername: expected }]);
        }
      }
    },
  );

  test("Pause reserves time and closed interval endpoints conflict even for the same delegatee", async () => {
    const service = createService();
    const created = await service.createPrivilegeDelegation(input(), context);
    await service.updateDelegation(created.id, { status: PrivilegeDelegationStatus.Pause }, context);
    const before = await persisted();
    const error = await failure(
      service.createPrivilegeDelegation(
        input({ startTime: endTime, endTime: new Date("2026-09-12T00:00:00Z") }),
        context,
      ),
    );
    expect(error).toBeInstanceOf(PrivilegeAlreadyDelegatedError);
    const after = await persisted();
    expect(after).toEqual(before);
  });

  test("partially intersecting privilege sets conflict and Pause can resume without conflicting with itself", async () => {
    const service = createService();
    const created = await service.createPrivilegeDelegation(
      input({ privilegeCodes: ["read", "write"] }),
      context,
    );
    await service.updateDelegation(created.id, { status: PrivilegeDelegationStatus.Pause }, context);
    const resumed = await service.updateDelegation(
      created.id,
      { status: PrivilegeDelegationStatus.Enable },
      context,
    );
    expect(resumed).toBe(true);
    const before = await persisted();
    const error = await failure(
      service.createPrivilegeDelegation(
        input({ privilegeCodes: ["write"], delegateeUsername: "carol" }),
        context,
      ),
    );
    expect(error).toBeInstanceOf(PrivilegeAlreadyDelegatedError);
    const after = await persisted();
    expect(after).toEqual(before);
  });

  test.each(["ended", "deleted"])("%s records do not reserve intervals", async (kind) => {
    const service = createService();
    const created = await service.createPrivilegeDelegation(input(), context);
    if (kind === "ended") {
      await service.updateDelegation(created.id, { status: PrivilegeDelegationStatus.Disable }, context);
    }
    else {
      await harness.db
        .update(privilegeDelegations)
        .set({ isDelete: true })
        .where(eq(privilegeDelegations.id, created.id));
    }
    const next = await service.createPrivilegeDelegation(input(), context);
    expect(next.id).not.toBe(created.id);
  });

  test("rejects self delegation and invalid periods without business or audit writes", async () => {
    const service = createService();
    for (const overrides of [
      { delegateeUsername: "alice" },
      { endTime: startTime },
      { startTime: endTime, endTime: startTime },
    ]) {
      const error = await failure(service.createPrivilegeDelegation(input(overrides), context));
      expect(error).toMatchObject({ httpStatus: 400, code: "COMMON.BAD_REQUEST" });
    }
    const state = await persisted();
    expect(state).toEqual({ delegations: [], details: [], audits: [] });
  });

  test("revalidates merged partial updates and excludes the current row", async () => {
    const service = createService();
    const first = await service.createPrivilegeDelegation(input(), context);
    const second = await service.createPrivilegeDelegation(
      input({ startTime: new Date("2026-09-11T00:00:00Z"), endTime: new Date("2026-09-20T00:00:00Z") }),
      context,
    );
    const result = await service.updateDelegation(first.id, { description: "updated" }, context);
    expect(result).toBe(true);
    const before = await persisted();
    const invalidTime = await failure(service.updateDelegation(first.id, { startTime: endTime }, context));
    const conflict = await failure(service.updateDelegation(second.id, { startTime: endTime }, context));
    expect(invalidTime).toMatchObject({ httpStatus: 400, code: "COMMON.BAD_REQUEST" });
    expect(conflict).toBeInstanceOf(PrivilegeAlreadyDelegatedError);
    const after = await persisted();
    expect(after).toEqual(before);
  });

  test("ended records reject business fields and repeated end preserves stored facts", async () => {
    const service = createService();
    const created = await service.createPrivilegeDelegation(input(), context);
    await service.updateDelegation(created.id, { status: PrivilegeDelegationStatus.Disable }, context);
    const ended = await persisted();
    const repeated = await service.updateDelegation(
      created.id,
      { status: PrivilegeDelegationStatus.Disable },
      context,
    );
    expect(repeated).toBe(true);
    const repeatedState = await persisted();
    expect(repeatedState.delegations).toEqual(ended.delegations);
    expect(repeatedState.audits).toHaveLength(3);
    expect(repeatedState.audits[2]).toMatchObject({
      action: "internal.delegation.update",
      targetId: created.id,
      outcome: "success",
      details: { changed: false, patch: { status: PrivilegeDelegationStatus.Disable } },
    });
    for (const dto of [
      { description: "changed" },
      { status: PrivilegeDelegationStatus.Enable },
      { endTime },
      { status: PrivilegeDelegationStatus.Disable, description: "changed" },
    ]) {
      const error = await failure(service.updateDelegation(created.id, dto, context));
      expect(error).toBeInstanceOf(PrivilegeDelegationEndedError);
    }
    const afterRejectedEdits = await persisted();
    expect(afterRejectedEdits).toEqual(repeatedState);
  });

  test.each(["create", "update", "end"])(
    "audit failure rolls back %s with details and history",
    async (operation) => {
      const service = createService();
      const created
        = operation === "create" ? undefined : await service.createPrivilegeDelegation(input(), context);
      const before = await persisted();
      await harness.sql.unsafe(
        "ALTER TABLE audit_log ADD CONSTRAINT reject_test_audit CHECK (request_id <> 'reject-audit')",
      );
      try {
        const failingContext = {
          ...context,
          requestContext: { ...context.requestContext, requestId: "reject-audit" },
        };
        const error = await failure(
          operation === "create"
            ? service.createPrivilegeDelegation(input({ privilegeCodes: ["read", "write"] }), failingContext)
            : service.updateDelegation(
                created!.id,
                operation === "end"
                  ? { status: PrivilegeDelegationStatus.Disable }
                  : { description: "must rollback" },
                failingContext,
              ),
        );
        expect(error).toBeInstanceOf(Error);
        const after = await persisted();
        expect(after).toEqual(before);
      }
      finally {
        await harness.sql.unsafe("ALTER TABLE audit_log DROP CONSTRAINT reject_test_audit");
      }
    },
  );

  test("concurrent conflicting creates commit one delegation and one success audit", async () => {
    const { service, identities } = concurrentService();
    const results = await Promise.allSettled([
      service.createPrivilegeDelegation(input({ orgCode: "ROOT" }), context),
      service.createPrivilegeDelegation(input({ delegateeUsername: "carol" }), context),
    ]);
    expectIndependentTransactions(identities);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(PrivilegeAlreadyDelegatedError);
    const state = await persisted();
    expect(state.delegations).toHaveLength(1);
    expect(state.details).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      targetId: state.delegations[0]!.id,
      actorClientCode: "delegation-contract",
      requestId: "delegation-contract-request",
      outcome: "success",
    });
  });

  test("concurrent sibling-scope creates serialize and both commit", async () => {
    const { service, identities } = concurrentService();
    const results = await Promise.allSettled([
      service.createPrivilegeDelegation(input(), context),
      service.createPrivilegeDelegation(input({ orgCode: "RIGHT", delegateeUsername: "carol" }), context),
    ]);
    expectIndependentTransactions(identities);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const state = await persisted();
    expect(state.delegations).toHaveLength(2);
    expect(state.details).toHaveLength(2);
    expect(state.audits).toHaveLength(2);
  });

  test("concurrent updates cannot move disjoint intervals into a shared interval", async () => {
    const initial = createService();
    const first = await initial.createPrivilegeDelegation(
      input({ endTime: new Date("2026-09-03T00:00:00Z") }),
      context,
    );
    const second = await initial.createPrivilegeDelegation(
      input({ startTime: new Date("2026-09-08T00:00:00Z") }),
      context,
    );
    const { service, identities } = concurrentService();
    const results = await Promise.allSettled([
      service.updateDelegation(first.id, { endTime: new Date("2026-09-06T00:00:00Z") }, context),
      service.updateDelegation(second.id, { startTime: new Date("2026-09-05T00:00:00Z") }, context),
    ]);
    expectIndependentTransactions(identities);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")?.reason).toBeInstanceOf(
      PrivilegeAlreadyDelegatedError,
    );
    const state = await persisted();
    expect(state.delegations[0]!.endTime.getTime()).toBeLessThan(state.delegations[1]!.startTime.getTime());
    expect(state.audits).toHaveLength(3);
  });

  test("concurrent create and extension share the delegator lock", async () => {
    const created = await createService().createPrivilegeDelegation(
      input({ endTime: new Date("2026-09-03T00:00:00Z") }),
      context,
    );
    const { service, identities } = concurrentService();
    const results = await Promise.allSettled([
      service.updateDelegation(created.id, { endTime }, context),
      service.createPrivilegeDelegation(input({ startTime: new Date("2026-09-05T00:00:00Z") }), context),
    ]);
    expectIndependentTransactions(identities);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")?.reason).toBeInstanceOf(
      PrivilegeAlreadyDelegatedError,
    );
    const state = await persisted();
    expect(state.audits).toHaveLength(2);
    if (results[0]!.status === "fulfilled") {
      expect(state.delegations).toHaveLength(1);
      expect(state.delegations[0]!.endTime).toEqual(endTime);
    }
    else {
      expect(state.delegations).toHaveLength(2);
      expect(state.delegations[0]!.endTime.getTime()).toBeLessThan(state.delegations[1]!.startTime.getTime());
    }
  });

  test("concurrent end and replacement create commit only valid serialized facts", async () => {
    const created = await createService().createPrivilegeDelegation(input(), context);
    const { service, identities } = concurrentService();
    const results = await Promise.allSettled([
      service.updateDelegation(created.id, { status: PrivilegeDelegationStatus.Disable }, context),
      service.createPrivilegeDelegation(input({ delegateeUsername: "carol" }), context),
    ]);
    expectIndependentTransactions(identities);
    expect(results[0]!.status).toBe("fulfilled");
    const state = await persisted();
    expect(state.delegations[0]!.status).toBe(PrivilegeDelegationStatus.Disable);
    if (results[1]!.status === "fulfilled") {
      expect(state.delegations).toHaveLength(2);
      expect(state.audits).toHaveLength(3);
    }
    else {
      expect(results[1]!.reason).toBeInstanceOf(PrivilegeAlreadyDelegatedError);
      expect(state.delegations).toHaveLength(1);
      expect(state.audits).toHaveLength(2);
    }
  });

  test("concurrent end and edit have a serializable outcome and never reopen ended facts", async () => {
    const created = await createService().createPrivilegeDelegation(input(), context);
    const { service, identities } = concurrentService();
    const results = await Promise.allSettled([
      service.updateDelegation(created.id, { status: PrivilegeDelegationStatus.Disable }, context),
      service.updateDelegation(created.id, { description: "concurrent edit" }, context),
    ]);
    expectIndependentTransactions(identities);
    expect(results[0]!.status).toBe("fulfilled");
    const state = await persisted();
    expect(state.delegations[0]!.status).toBe(PrivilegeDelegationStatus.Disable);
    if (results[1]!.status === "rejected") {
      expect(results[1]!.reason).toBeInstanceOf(PrivilegeDelegationEndedError);
      expect(state.delegations[0]!.description).toBeNull();
      expect(state.audits).toHaveLength(2);
    }
    else {
      expect(state.delegations[0]!.description).toBe("concurrent edit");
      expect(state.audits).toHaveLength(3);
    }
  });
});
