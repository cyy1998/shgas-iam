import type { AuditLogInput } from "@api/services/audit/audit.context";
import type { RegisterPurveyorContactTransactionPorts } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.port";
import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import type { DbClient } from "@iam/db";
import type { ApiPostgresTestHarness } from "./postgres-test-harness";
import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { createUserRoute } from "@api/routes/internal/user/user.index";
import { createUserRepository } from "@api/services/user/user.repository";
import { createRegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createUnitOfWork } from "@iam/api-core/uow";
import { ApiErrorCode, UserType } from "@iam/contracts";
import { employments, users } from "@iam/db/schema";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createApiPostgresTestHarness } from "./postgres-test-harness";

const mobile = "13800000000";
const subjectAccessMutationReceipts = [
  {
    subjectIdentifier: "20000000-0000-4000-8000-000000000001",
    transitionId: "30000000-0000-4000-8000-000000000001",
    ownerToken: "40000000-0000-4000-8000-000000000001",
  },
  {
    subjectIdentifier: "20000000-0000-4000-8000-000000000002",
    transitionId: "30000000-0000-4000-8000-000000000002",
    ownerToken: "40000000-0000-4000-8000-000000000002",
  },
] satisfies readonly SubjectAccessMutationReceipt[];

let harness: ApiPostgresTestHarness | undefined;

const contactOptions = {
  actor: {
    actorType: "client" as const,
    actorUserId: null,
    actorUsername: null,
    actorClientCode: "portal",
    actorSystemKey: null,
  },
};

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

describe("Register Purveyor Contact PostgreSQL contract", () => {
  test("serializes same-mobile registrations to one user and one audit target", async () => {
    const { auditEvents, useCase } = createUseCase();
    const options = {
      actor: {
        actorType: "client" as const,
        actorUserId: null,
        actorUsername: null,
        actorClientCode: "portal",
        actorSystemKey: null,
      },
    };

    const results = await Promise.all([
      useCase.execute({
        mobile,
        name: "张三",
        orgCode: "SUP",
        username: "supplier-a",
      }, options),
      useCase.execute({
        mobile,
        name: "李四",
        orgCode: "SUP",
        username: "supplier-b",
      }, options),
    ]);
    expect(results).toEqual([true, true]);

    const persistedUsers = await harness!.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.mobile, mobile));
    const persistedEmployments = await harness!.db
      .select({ userId: employments.userId })
      .from(employments);
    expect(persistedUsers).toHaveLength(1);
    expect(persistedEmployments).toEqual([{ userId: persistedUsers[0]!.id }]);
    expect(auditEvents).toHaveLength(2);
    expect(new Set(auditEvents.map(event => event.targetId ?? null))).toEqual(
      new Set([persistedUsers[0]!.id]),
    );
    expect(auditEvents.map(event => event.details?.existingContact).sort())
      .toEqual([false, true]);
  });

  test("normalizes a new contact through the real HTTP parser and preserves username case", async () => {
    const { useCase } = createUseCase();
    const app = createContactApp(useCase);
    const response = await requestContact(app, {
      mobile: "13800000001",
      name: "  Contact Name  ",
      orgCode: "SUP",
      username: "  Mixed-Case  ",
    });
    expect(response.status).toBe(200);

    const persisted = await harness!.db.select().from(users);
    expect(persisted).toMatchObject([{
      mobile: "13800000001",
      name: "Contact Name",
      username: "Mixed-Case",
      userType: UserType.External,
    }]);
  });

  test.each([
    ["blank username", { mobile: "13800000001", name: "Valid", orgCode: "SUP", username: "   " }],
    ["overlong username", { mobile: "13800000002", name: "Valid", orgCode: "SUP", username: "U".repeat(65) }],
    ["blank name", { mobile: "13800000003", name: "   ", orgCode: "SUP", username: "valid" }],
    ["overlong name", { mobile: "13800000004", name: "N".repeat(65), orgCode: "SUP", username: "valid" }],
  ] as const)("rejects a normalized %s without creating User or Employment facts", async (_, input) => {
    const { useCase } = createUseCase();
    const app = createContactApp(useCase);
    const response = await requestContact(app, input);
    expect(response.status).toBe(422);
    const persistedUsers = await harness!.db.select().from(users);
    const persistedEmployments = await harness!.db.select().from(employments);
    expect(persistedUsers).toEqual([]);
    expect(persistedEmployments).toEqual([]);
  });

  test("accepts 64-character username and name fields", async () => {
    const { useCase } = createUseCase();
    const app = createContactApp(useCase);
    const username = "u".repeat(64);
    const name = "N".repeat(64);
    const response = await requestContact(app, {
      mobile: "13800000011",
      name,
      orgCode: "SUP",
      username,
    });
    expect(response.status).toBe(200);

    const persisted = await harness!.db.select({ name: users.name, username: users.username }).from(users);
    expect(persisted).toEqual([{ name, username }]);
  });

  test("preserves username case in uniqueness decisions", async () => {
    const { useCase } = createUseCase();
    const app = createContactApp(useCase);
    for (const [username, currentMobile] of [["case-user", "13800000011"], ["Case-User", "13800000012"]]) {
      const response = await requestContact(app, {
        mobile: currentMobile,
        name: username,
        orgCode: "SUP",
        username,
      });
      expect(response.status).toBe(200);
    }

    const persisted = await harness!.db.select({ name: users.name, username: users.username }).from(users);
    expect(persisted).toEqual([
      { name: "case-user", username: "case-user" },
      { name: "Case-User", username: "Case-User" },
    ]);
  });

  test("allows distinct usernames to share a contact name", async () => {
    const { useCase } = createUseCase();
    const app = createContactApp(useCase);
    for (const [username, currentMobile] of [["first-user", "13800000011"], ["second-user", "13800000012"]]) {
      const response = await requestContact(app, {
        mobile: currentMobile,
        name: "Same Name",
        orgCode: "SUP",
        username,
      });
      expect(response.status).toBe(200);
    }

    const persisted = await harness!.db.select({ name: users.name, username: users.username }).from(users);
    expect(persisted).toEqual([
      { name: "Same Name", username: "first-user" },
      { name: "Same Name", username: "second-user" },
    ]);
  });

  for (const occupiedBy of ["active", "soft-deleted"] as const) {
    test(`maps a ${occupiedBy} username conflict and leaves no new contact facts`, async () => {
      await harness!.db.insert(users).values({
        username: "occupied",
        name: "Existing",
        isDelete: occupiedBy === "soft-deleted",
      });
      const { useCase } = createUseCase();
      const response = await requestContact(createContactApp(useCase), {
        mobile: "13800000005",
        name: "New Contact",
        orgCode: "SUP",
        username: "  occupied  ",
      });
      expect(response.status).toBe(409);
      const body = await response.json();
      const persistedUsers = await harness!.db.select().from(users);
      const persistedEmployments = await harness!.db.select().from(employments);
      expect(body).toMatchObject({ code: ApiErrorCode.UsernameAlreadyExists });
      expect(persistedUsers).toHaveLength(1);
      expect(persistedEmployments).toEqual([]);
    });
  }

  test("reuses a mobile-matched User without rewriting its identity", async () => {
    const [existing] = await harness!.db.insert(users).values({
      username: "existing-user",
      name: "Existing Name",
      mobile: "13800000006",
    }).returning();
    const { useCase } = createUseCase();
    const result = await useCase.execute({
      mobile: "13800000006",
      name: "Different Name",
      orgCode: "SUP",
      username: "different-user",
    }, contactOptions);
    expect(result).toBe(true);

    const persistedUsers = await harness!.db.select().from(users);
    const persistedEmployments = await harness!.db.select().from(employments);
    expect(persistedUsers).toMatchObject([{
      id: existing!.id,
      username: "existing-user",
      name: "Existing Name",
    }]);
    expect(persistedEmployments).toMatchObject([{ userId: existing!.id }]);
  });
});

function createUseCase() {
  const auditEvents: AuditLogInput[] = [];
  const pendingSubjectAccessReceipts = [...subjectAccessMutationReceipts];
  const useCase = createRegisterPurveyorContactUseCase({
    auditLogWriter: {
      recordAuditLog: mock(async (event) => {
        auditEvents.push(event);
      }),
    },
    config: { nodeEnv: "test" },
    mobileService: {
      getPurveyorWelcomeMessage: mock(() => "welcome"),
      sendMessage: mock(async () => true),
    },
    random: {
      uuid: () => {
        const receipt = pendingSubjectAccessReceipts.shift();
        if (receipt === undefined)
          throw new Error("Subject Access receipt fixture is exhausted");
        return receipt.subjectIdentifier;
      },
    },
    subjectAccessLifecycle: {
      async run(input) {
        const receipt = subjectAccessMutationReceipts.find(
          candidate => candidate.subjectIdentifier === input.subjectIdentifier,
        );
        if (receipt === undefined) {
          throw new Error(
            `Subject Access lifecycle received an unknown Subject Identifier: ${input.subjectIdentifier}`,
          );
        }
        return await input.mutate(receipt);
      },
    },
    uow: createUnitOfWork<DbClient, RegisterPurveyorContactTransactionPorts>({
      db: harness!.db,
      logger: {
        error: mock(() => undefined),
        warn: mock(() => undefined),
      },
      createTxPorts: tx => createTransactionPorts(tx),
    }),
    userReader: {
      getActiveUserByMobile: mock(async () => null),
    },
  });
  return { auditEvents, useCase };
}

function createContactApp(useCase: ReturnType<typeof createRegisterPurveyorContactUseCase>) {
  const app = new Hono();
  app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() } as never));
  app.route("/internal", createUserRoute(createUserHandlers({
    registerPurveyorContact: useCase,
  } as never)));
  return app;
}

async function requestContact(app: Hono, body: unknown) {
  return await app.request("http://localhost/internal/users/purveyor/contacts", {
    method: "POST",
    headers: {
      "Client": "portal",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createTransactionPorts(tx: DbClient): RegisterPurveyorContactTransactionPorts {
  const repository = createUserRepository(tx);
  return {
    employmentRepository: {
      async getEmploymentByUserOrgPosId(userId: number, orgId: number, posId: number) {
        return await tx.query.employments.findFirst({
          where: {
            isDelete: false,
            orgId,
            posId,
            userId,
          },
        }) ?? null;
      },
      async setEmployment(userId: number, posId: number, orgId: number) {
        return (await tx.insert(employments).values({ orgId, posId, userId }).returning())[0]!;
      },
    },
    organizationRepository: {
      getOrganizationByCode: mock(async () => ({ id: 2 })),
    },
    positionRepository: {
      getPositionByCode: mock(async () => ({ id: 3 })),
    },
    subjectAccessMutation: {
      async runMutation(_receipt, mutation, resolveTarget) {
        const result = await mutation();
        resolveTarget(result);
        return result;
      },
    },
    userProfileInvalidation: {
      recordChanges: mock(async () => undefined),
    },
    userRepository: {
      ...repository,
      async getUserByMobile(currentMobile: string) {
        const user = await repository.getUserByMobile(currentMobile);
        if (user === null)
          await tx.execute(sql`select pg_sleep(0.1)`);
        return user;
      },
    },
  };
}
