import type { AuditLogInput } from "@api/services/audit/audit.context";
import type { RegisterPurveyorContactTransactionPorts } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.port";
import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import type { DbClient } from "@iam/db";
import type { ApiPostgresTestHarness } from "./postgres-test-harness";
import { createUserRepository } from "@api/services/user/user.repository";
import { createRegisterPurveyorContactUseCase } from "@api/use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import { createUnitOfWork } from "@iam/api-core/uow";
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

describe("Register Purveyor Contact PostgreSQL concurrency contract", () => {
  test("serializes same-mobile registrations to one user and one audit target", async () => {
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
});

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
