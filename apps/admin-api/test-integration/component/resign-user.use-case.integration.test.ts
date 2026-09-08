import type {
  ResignUserTransactionPorts,
  ResignUserUseCaseDeps,
} from "@admin-api/use-cases/employment/resign-user/resign-user.port";
import type { SubjectAccessLifecycleRunInput, SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/testing/fakes";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { UserStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const previousSubjectAccessTransitionId = "20000000-0000-4000-8000-000000000001";
const subjectAccessMutationReceipt: SubjectAccessMutationReceipt = {
  subjectIdentifier,
  transitionId: "10000000-0000-4000-8000-000000000001",
  ownerToken: "10000000-0000-4000-8000-000000000002",
};
const defaultTarget = {
  id: 1,
  subjectIdentifier,
  username: "zhangsan",
  name: "张三",
  status: UserStatus.Enable,
  isDelete: false,
} as const;

function createSubjectAccessMutation(): ResignUserTransactionPorts["subjectAccessMutation"] {
  return {
    runMutation: async <T>(
      _receipt: SubjectAccessMutationReceipt,
      mutation: () => Promise<T>,
    ) => await mutation(),
  };
}

function createSessionRevocation() {
  const revokeUserSessions = mock(async () => undefined);
  return {
    revokeUserSessions,
    prepareUserSessionRevocation: mock(async () => ({ revoke: revokeUserSessions })),
  };
}

function createResponsibilityParentLifecycle(changed = false) {
  return {
    lockAssignmentsForEmployments: mock(async () => []),
    endOpenAssignmentsForUserResignation: mock(async () => changed),
  };
}

function createSubjectAccessLifecycle(preBlockError?: Error) {
  const runSpy = mock(() => undefined);
  async function run<Result>(input: SubjectAccessLifecycleRunInput<Result>): Promise<Result> {
    runSpy();
    if (preBlockError)
      throw preBlockError;
    const result = await input.mutate(subjectAccessMutationReceipt);
    try {
      await input.revokeSessions?.(result, {
        invalidatedSubjectAccessTransitionId: previousSubjectAccessTransitionId,
      });
    }
    catch {
      // Session revocation remains best-effort after the account mutation commits.
    }
    return result;
  }
  return { run, runSpy };
}

function createUserReader(
  value: ResignUserUseCaseDeps["userReader"] extends {
    getUserByUsernameForAdmin: (...args: never[]) => Promise<infer T>;
  } ? T : never = defaultTarget,
) {
  return {
    getUserByUsernameForAdmin: mock(async () => value),
    getUserByUsernameIncludingDeletedForAuthorization: mock(async () => value),
    getOpenEmploymentOrganizationIdsByUserId: mock(async () => []),
    getEndedEmploymentOrganizationIdsByUserId: mock(async () => []),
  };
}

function createUserStore(
  overrides: Partial<ResignUserTransactionPorts["userStore"]> = {},
): ResignUserTransactionPorts["userStore"] {
  return {
    lockUserByUsername: mock(async () => defaultTarget),
    getUserByUsernameForAdmin: mock(async () => defaultTarget),
    getUserByUsernameIncludingDeletedForAuthorization: mock(async () => defaultTarget),
    getOpenEmploymentOrganizationIdsByUserId: mock(async () => []),
    getEndedEmploymentOrganizationIdsByUserId: mock(async () => []),
    updateUserByUsername: mock(async () => defaultTarget),
    ...overrides,
  };
}

async function createScopedAuthorization(organizationIds = [10]) {
  return await createAdminAuthorizationPolicy({
    logger: { warn: mock() },
    hrAdministrationScopeResolver: {
      resolveForActor: async () => ({
        rootOrganizationIds: [organizationIds[0]!],
        organizationIds,
      }),
    },
  }).getUserAuthorization({
    userId: 99,
    username: "hr-admin",
    roles: ["iam:hr-admin"],
  });
}

function createTransaction(): ResignUserTransactionPorts {
  return {
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    subjectAccessMutation: createSubjectAccessMutation(),
    employmentStore: {
      getOpenEmploymentIdsByUserId: mock(async () => []),
      lockEmploymentsByIds: mock(async () => []),
      updateEmploymentRecord: mock(async () => { throw new Error("unexpected employment write"); }),
    },
    responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
    userProfileInvalidation: { recordChanges: mock(async () => undefined) },
    userStore: createUserStore(),
  };
}

describe("createResignUserUseCase", () => {
  test("propagates an unknown transaction outcome without claiming business commit", async () => {
    const sentinel = new Error("transaction completion unknown");
    const tx = createTransaction();
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation: createSessionRevocation(),
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      userReader: createUserReader(),
      uow: { transaction: async (callback) => {
        await callback({ ...tx, afterCommit: { required: mock(), bestEffort: mock() } });
        throw sentinel;
      } },
    });
    let failure: unknown;
    try {
      await useCase.execute({ username: "zhangsan" });
    }
    catch (error) { failure = error; }
    expect(failure).toBe(sentinel);
  });

  test("pre-block failure prevents transaction and Session work", async () => {
    const sentinel = new Error("subject access unavailable");
    const tx = createTransaction();
    const sessionRevocation = createSessionRevocation();
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(sentinel),
      userReader: createUserReader(),
      uow: createImmediateUnitOfWork(tx),
    });
    let failure: unknown;
    try {
      await useCase.execute({ username: "zhangsan" });
    }
    catch (error) { failure = error; }
    expect(failure).toBe(sentinel);
    expect(tx.userStore.lockUserByUsername).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("missing target stops before Subject Access and transaction work", async () => {
    const lifecycle = createSubjectAccessLifecycle();
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation: createSessionRevocation(),
      subjectAccessLifecycle: lifecycle,
      userReader: createUserReader(null),
      uow: createImmediateUnitOfWork(createTransaction()),
    });
    let failure: unknown;
    try {
      await useCase.execute({ username: "missing" });
    }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ httpStatus: 404 });
    expect(lifecycle.runSpy).not.toHaveBeenCalled();
  });

  test("rejects an HR target with any out-of-scope Open Employment before Subject Access starts", async () => {
    const subjectAccessLifecycle = createSubjectAccessLifecycle();
    const target = {
      id: 1,
      subjectIdentifier,
      username: "zhangsan",
      name: "张三",
      status: UserStatus.Enable,
      isDelete: false,
    };
    const userReader = {
      getUserByUsernameForAdmin: mock(async () => target),
      getUserByUsernameIncludingDeletedForAuthorization: mock(async () => target),
      getOpenEmploymentOrganizationIdsByUserId: mock(async () => [10, 20]),
      getEndedEmploymentOrganizationIdsByUserId: mock(async () => []),
    };
    const authorization = await createScopedAuthorization();
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: { getOpenEmploymentIdsByUserId: mock(async () => []), lockEmploymentsByIds: mock(async () => []), updateEmploymentRecord: mock(async () => { throw new Error("unexpected write"); }) },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        ...userReader,
        lockUserByUsername: mock(async () => target),
        updateUserByUsername: mock(async () => target),
      },
    };
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation: createSessionRevocation(),
      subjectAccessLifecycle,
      uow: createImmediateUnitOfWork(tx),
      userReader,
    });

    let failure: unknown;
    try {
      await useCase.execute({ username: "zhangsan" }, {
        authorization,
        auditContext: {
          actorType: "admin",
          actorUserId: target.id,
        },
      });
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ httpStatus: 403 });
    expect(subjectAccessLifecycle.runSpy).not.toHaveBeenCalled();
    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects every zero-Open non-completed HR shape before Subject Access starts", async () => {
    const cases = [
      {
        status: UserStatus.Enable,
        isDelete: false,
        endedEmploymentOrganizationIds: [10],
      },
      {
        status: UserStatus.Pause,
        isDelete: false,
        endedEmploymentOrganizationIds: [10],
      },
      {
        status: UserStatus.Disable,
        isDelete: false,
        endedEmploymentOrganizationIds: [],
      },
      {
        status: UserStatus.Disable,
        isDelete: false,
        endedEmploymentOrganizationIds: [20],
      },
      {
        status: UserStatus.Disable,
        isDelete: true,
        endedEmploymentOrganizationIds: [10],
      },
    ] as const;

    for (const facts of cases) {
      const target = { ...defaultTarget, status: facts.status, isDelete: facts.isDelete };
      const subjectAccessLifecycle = createSubjectAccessLifecycle();
      const userReader = {
        lockUserByUsername: mock(async () => target),
        getUserByUsernameForAdmin: mock(async () => target),
        getUserByUsernameIncludingDeletedForAuthorization: mock(async () => target),
        getOpenEmploymentOrganizationIdsByUserId: mock(async () => []),
        getEndedEmploymentOrganizationIdsByUserId: mock(async () =>
          [...facts.endedEmploymentOrganizationIds]),
      };
      const useCase = createResignUserUseCase({
        clock: createFakeClock(),
        sessionRevocation: createSessionRevocation(),
        subjectAccessLifecycle,
        uow: createImmediateUnitOfWork({
          auditLogWriter: { recordAuditLog: mock(async () => undefined) },
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentStore: { getOpenEmploymentIdsByUserId: mock(async () => []), lockEmploymentsByIds: mock(async () => []), updateEmploymentRecord: mock(async () => { throw new Error("unexpected write"); }) },
          responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
          userProfileInvalidation: { recordChanges: mock(async () => undefined) },
          userStore: createUserStore(),
        }),
        userReader,
      });

      let failure: unknown;
      try {
        await useCase.execute(
          { username: "zhangsan" },
          { authorization: await createScopedAuthorization() },
        );
      }
      catch (error) {
        failure = error;
      }

      expect(failure).toMatchObject({ httpStatus: 403 });
      expect(subjectAccessLifecycle.runSpy).not.toHaveBeenCalled();
    }
  });

  test("rechecks HR resignation scope inside the transaction before any business write", async () => {
    const target = {
      id: 1,
      subjectIdentifier,
      username: "zhangsan",
      name: "张三",
      status: UserStatus.Enable,
      isDelete: false,
    };
    const userReader = {
      getUserByUsernameForAdmin: mock(async () => target),
      getUserByUsernameIncludingDeletedForAuthorization: mock(async () => target),
      getOpenEmploymentOrganizationIdsByUserId: mock(async () => [10]),
      getEndedEmploymentOrganizationIdsByUserId: mock(async () => []),
    };
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: { getOpenEmploymentIdsByUserId: mock(async () => []), lockEmploymentsByIds: mock(async () => []), updateEmploymentRecord: mock(async () => { throw new Error("unexpected write"); }) },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        lockUserByUsername: mock(async () => target),
        getUserByUsernameForAdmin: mock(async () => target),
        getUserByUsernameIncludingDeletedForAuthorization: mock(async () => target),
        getOpenEmploymentOrganizationIdsByUserId: mock(async () => [10, 20]),
        getEndedEmploymentOrganizationIdsByUserId: mock(async () => []),
        updateUserByUsername: mock(async () => target),
      },
    };
    const sessionRevocation = createSessionRevocation();
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow: createImmediateUnitOfWork(tx),
      userReader,
    });

    let failure: unknown;
    try {
      await useCase.execute(
        { username: "zhangsan" },
        { authorization: await createScopedAuthorization() },
      );
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ httpStatus: 403 });
    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.userStore.updateUserByUsername).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    expect(sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("rechecks HR scope after the complete responsibility lock wait", async () => {
    const tx = createTransaction();
    let locked = false;
    tx.userStore.getOpenEmploymentOrganizationIdsByUserId = mock(async () => locked ? [10, 20] : [10]);
    tx.responsibilityParentLifecycle.lockAssignmentsForEmployments = mock(async () => {
      locked = true;
      return [];
    });
    const reader = { ...createUserReader(), getOpenEmploymentOrganizationIdsByUserId: mock(async () => [10]) };
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation: createSessionRevocation(),
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      userReader: reader,
      uow: createImmediateUnitOfWork(tx),
    });
    let failure: unknown;
    try {
      await useCase.execute({ username: "zhangsan" }, { authorization: await createScopedAuthorization() });
    }
    catch (error) {
      failure = error;
    }
    expect(locked).toBe(true);
    expect(failure).toMatchObject({ httpStatus: 403 });
    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.userStore.updateUserByUsername).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("treats only the scoped completed shape as a no-op retry and revokes Sessions again", async () => {
    const target = {
      id: 1,
      subjectIdentifier,
      username: "zhangsan",
      name: "张三",
      status: UserStatus.Disable,
      isDelete: false,
    };
    const createEligibilityReader = () => ({
      getUserByUsernameForAdmin: mock(async () => target),
      getUserByUsernameIncludingDeletedForAuthorization: mock(async () => target),
      getOpenEmploymentOrganizationIdsByUserId: mock(async () => []),
      getEndedEmploymentOrganizationIdsByUserId: mock(async () => [10]),
    });
    const userReader = createEligibilityReader();
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: { getOpenEmploymentIdsByUserId: mock(async () => []), lockEmploymentsByIds: mock(async () => []), updateEmploymentRecord: mock(async () => { throw new Error("unexpected write"); }) },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        ...createEligibilityReader(),
        lockUserByUsername: mock(async () => target),
        updateUserByUsername: mock(async () => target),
      },
    };
    const clock = createFakeClock();
    const sessionRevocation = createSessionRevocation();
    const useCase = createResignUserUseCase({
      clock,
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow: createImmediateUnitOfWork(tx),
      userReader,
    });

    const result = await useCase.execute(
      { username: "zhangsan" },
      { authorization: await createScopedAuthorization() },
    );

    expect(result).toEqual({ changed: false, result: null });

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.responsibilityParentLifecycle.endOpenAssignmentsForUserResignation).toHaveBeenCalledWith(expect.objectContaining({ selectedAssignments: [] }));
    expect(tx.userStore.updateUserByUsername).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.resign_user",
      details: expect.objectContaining({ changed: false }),
    }));
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    expect(sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(1);
  });
});
