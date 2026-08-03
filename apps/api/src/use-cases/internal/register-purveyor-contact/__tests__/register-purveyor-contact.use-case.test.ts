import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { describe, expect, mock, test } from "bun:test";
import { createRegisterPurveyorContactUseCase } from "../register-purveyor-contact.use-case";

const input = {
  username: "zhangsan",
  mobile: "13800000000",
  name: "张三",
  orgCode: "SUP",
};

const options = {
  actor: {
    actorType: "client" as const,
    actorUserId: null,
    actorUsername: null,
    actorClientCode: "portal",
    actorSystemKey: null,
  },
  requestContext: {
    sourceApp: "iam",
    requestId: "req-1",
    traceId: "trace-1",
    ip: "127.0.0.1",
    userAgent: "test",
    route: "/internal/users/purveyor/contacts",
    method: "POST",
  },
};

const NEW_SUBJECT_IDENTIFIER = "22222222-2222-4222-8222-222222222222";
const subjectAccessMutationReceipt: SubjectAccessMutationReceipt = {
  subjectIdentifier: NEW_SUBJECT_IDENTIFIER,
  transitionId: "20000000-0000-4000-8000-000000000002",
  ownerToken: "20000000-0000-4000-8000-000000000003",
};

function createSubjectAccessMutation() {
  return {
    runMutation: async <T>(
      _receipt: SubjectAccessMutationReceipt,
      mutation: () => Promise<T>,
    ) => await mutation(),
  };
}

function createSubjectAccessDeps(existingUserId: number | null = 7) {
  return {
    random: {
      uuid: mock(() => NEW_SUBJECT_IDENTIFIER),
    },
    subjectAccessLifecycle: {
      run: mock(async (transition: {
        mutate: (receipt: SubjectAccessMutationReceipt) => Promise<unknown>;
      }) => await transition.mutate(subjectAccessMutationReceipt)),
    },
    userReader: {
      getActiveUserByMobile: mock(async () => existingUserId === null ? null : { id: existingUserId }),
    },
  };
}

describe("RegisterPurveyorContactUseCase", () => {
  test("adds employment for an existing supplier contact and marks the profile dirty", async () => {
    const userLookupOrder: string[] = [];
    const userProfileInvalidation = {
      recordChanges: mock(async () => undefined),
    };
    const setEmployment = mock(async () => ({}));
    const subjectAccess = createSubjectAccessDeps();
    const useCase = createRegisterPurveyorContactUseCase({
      ...subjectAccess,
      auditLogWriter: {
        recordAuditLog: mock(async () => undefined),
      },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => null),
            setEmployment,
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => ({ id: 2 })),
          },
          positionRepository: {
            getPositionByCode: mock(async () => ({ id: 3 })),
          },
          userProfileInvalidation,
          userRepository: {
            getUserByMobile: mock(async () => {
              userLookupOrder.push("lookup");
              return { id: 7 };
            }),
            lockPurveyorContactMobile: mock(async () => {
              userLookupOrder.push("lock");
            }),
            setUser: mock(async () => {
              throw new Error("setUser should not be called");
            }),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).resolves.toBe(true);

    expect(setEmployment).toHaveBeenCalledWith(7, 3, 2);
    expect(userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 7 },
    ]);
    expect(subjectAccess.subjectAccessLifecycle.run).not.toHaveBeenCalled();
    expect(userLookupOrder).toEqual(["lock", "lookup"]);
  });

  test("creates a new external supplier contact and marks user and employment facts dirty", async () => {
    const userLookupOrder: string[] = [];
    const userProfileInvalidation = {
      recordChanges: mock(async () => undefined),
    };
    const setUser = mock(async () => ({ id: 9 }));
    const setEmployment = mock(async () => ({}));
    const subjectAccess = createSubjectAccessDeps(null);
    const useCase = createRegisterPurveyorContactUseCase({
      ...subjectAccess,
      auditLogWriter: {
        recordAuditLog: mock(async () => undefined),
      },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => null),
            setEmployment,
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => ({ id: 2 })),
          },
          positionRepository: {
            getPositionByCode: mock(async () => ({ id: 3 })),
          },
          userProfileInvalidation,
          userRepository: {
            getUserByMobile: mock(async () => {
              userLookupOrder.push("lookup");
              return null;
            }),
            lockPurveyorContactMobile: mock(async () => {
              userLookupOrder.push("lock");
            }),
            setUser,
          },
        })),
      },
    } as never);

    await expect(useCase.execute({ ...input, username: "newuser", name: "新用户" }, options)).resolves.toBe(true);

    expect(setUser).toHaveBeenCalledWith({
      username: "newuser",
      name: "新用户",
      mobile: "13800000000",
      userType: "外部用户",
      password: null,
      subjectIdentifier: NEW_SUBJECT_IDENTIFIER,
    });
    expect(setEmployment).toHaveBeenCalledWith(9, 3, 2);
    expect(userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "user", userId: 9 },
      { kind: "employment", userId: 9 },
    ]);
    expect(subjectAccess.subjectAccessLifecycle.run).toHaveBeenCalledWith(expect.objectContaining({
      subjectIdentifier: NEW_SUBJECT_IDENTIFIER,
      disposition: "awaiting_publication",
    }));
    expect(userLookupOrder).toEqual(["lock", "lookup"]);
  });

  test("does not open a transaction when Subject Access cannot pre-block a new contact", async () => {
    const barrierError = new Error("subject access unavailable");
    const transaction = mock(async () => true);
    const subjectAccess = createSubjectAccessDeps(null);
    subjectAccess.subjectAccessLifecycle.run.mockRejectedValue(barrierError);
    const useCase = createRegisterPurveyorContactUseCase({
      ...subjectAccess,
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: { transaction },
    } as never);

    await expect(useCase.execute(input, options)).rejects.toBe(barrierError);

    expect(transaction).not.toHaveBeenCalled();
  });

  test("rolls back the unused subject transition when a concurrent contact already exists", async () => {
    const subjectAccess = createSubjectAccessDeps(null);
    const setUser = mock(async () => ({ id: 9 }));
    const setEmployment = mock(async () => ({}));
    const transaction = mock(async (callback: any) => await callback({
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentRepository: {
        getEmploymentByUserOrgPosId: mock(async () => null),
        setEmployment,
      },
      organizationRepository: {
        getOrganizationByCode: mock(async () => ({ id: 2 })),
      },
      positionRepository: {
        getPositionByCode: mock(async () => ({ id: 3 })),
      },
      userProfileInvalidation: {
        recordChanges: mock(async () => undefined),
      },
      userRepository: {
        getUserByMobile: mock(async () => ({ id: 7 })),
        lockPurveyorContactMobile: mock(async () => undefined),
        setUser,
      },
    }));
    const useCase = createRegisterPurveyorContactUseCase({
      ...subjectAccess,
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: { transaction },
    } as never);

    await expect(useCase.execute(input, options)).resolves.toBe(true);

    expect(subjectAccess.subjectAccessLifecycle.run).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(setUser).not.toHaveBeenCalled();
    expect(setEmployment).toHaveBeenCalledWith(7, 3, 2);
  });

  test("preserves request observability for existing and new supplier contact transactions", async () => {
    const transactionOptions: unknown[] = [];

    for (const existingUserId of [7, null]) {
      const useCase = createRegisterPurveyorContactUseCase({
        ...createSubjectAccessDeps(existingUserId),
        auditLogWriter: {
          recordAuditLog: mock(async () => undefined),
        },
        config: { nodeEnv: "test" },
        mobileService: {
          getPurveyorWelcomeMessage: mock(() => "welcome"),
          sendMessage: mock(async () => true),
        },
        uow: {
          transaction: mock(async (callback: any, currentOptions: unknown) => {
            transactionOptions.push(currentOptions);
            return await callback({
              subjectAccessMutation: createSubjectAccessMutation(),
              employmentRepository: {
                getEmploymentByUserOrgPosId: mock(async () => ({ id: 10 })),
                setEmployment: mock(async () => ({})),
              },
              organizationRepository: {
                getOrganizationByCode: mock(async () => ({ id: 2 })),
              },
              positionRepository: {
                getPositionByCode: mock(async () => ({ id: 3 })),
              },
              userProfileInvalidation: {
                recordChanges: mock(async () => undefined),
              },
              userRepository: {
                getUserByMobile: mock(async () => existingUserId === null ? null : { id: existingUserId }),
                lockPurveyorContactMobile: mock(async () => undefined),
                setUser: mock(async () => ({ id: 9 })),
              },
            });
          }),
        },
      } as never);

      await useCase.execute(input, options);
    }

    expect(transactionOptions).toEqual([
      { observability: options.requestContext },
      { observability: options.requestContext },
    ]);
  });

  test("records the supplier contact audit with request context and redacted mobile", async () => {
    const recordAuditLog = mock(async () => undefined);
    const useCase = createRegisterPurveyorContactUseCase({
      ...createSubjectAccessDeps(),
      auditLogWriter: { recordAuditLog },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => ({ id: 10 })),
            setEmployment: mock(async () => ({})),
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => ({ id: 2 })),
          },
          positionRepository: {
            getPositionByCode: mock(async () => ({ id: 3 })),
          },
          userProfileInvalidation: {
            recordChanges: mock(async () => undefined),
          },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
            lockPurveyorContactMobile: mock(async () => undefined),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await useCase.execute(input, options);

    expect(recordAuditLog).toHaveBeenCalledWith({
      action: "internal.purveyor_contact.register",
      actorClientCode: "portal",
      actorSystemKey: null,
      actorType: "client",
      actorUserId: null,
      actorUsername: null,
      details: {
        existingContact: true,
        mobile: "138****0000",
        name: "张三",
        orgCode: "SUP",
        username: "zhangsan",
      },
      ip: "127.0.0.1",
      method: "POST",
      outcome: "success",
      requestId: "req-1",
      route: "/internal/users/purveyor/contacts",
      sourceApp: "iam",
      targetCode: "zhangsan",
      targetId: 7,
      targetType: "user",
      traceId: "trace-1",
      userAgent: "test",
    });
  });

  test("sends the supplier welcome message after audit in production", async () => {
    const callOrder: string[] = [];
    const sendMessage = mock(async () => {
      callOrder.push("sms");
      return true;
    });
    const useCase = createRegisterPurveyorContactUseCase({
      ...createSubjectAccessDeps(),
      auditLogWriter: {
        recordAuditLog: mock(async () => {
          callOrder.push("audit");
        }),
      },
      config: { nodeEnv: "production" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage,
      },
      uow: {
        transaction: mock(async (callback: any) => {
          const result = await callback({
            subjectAccessMutation: createSubjectAccessMutation(),
            employmentRepository: {
              getEmploymentByUserOrgPosId: mock(async () => ({ id: 10 })),
              setEmployment: mock(async () => ({})),
            },
            organizationRepository: {
              getOrganizationByCode: mock(async () => ({ id: 2 })),
            },
            positionRepository: {
              getPositionByCode: mock(async () => ({ id: 3 })),
            },
            userProfileInvalidation: {
              recordChanges: mock(async () => undefined),
            },
            userRepository: {
              getUserByMobile: mock(async () => ({ id: 7 })),
              lockPurveyorContactMobile: mock(async () => undefined),
              setUser: mock(async () => ({ id: 9 })),
            },
          });
          callOrder.push("commit");
          return result;
        }),
      },
    } as never);

    await useCase.execute(input, options);

    expect(sendMessage).toHaveBeenCalledWith("13800000000", "welcome");
    expect(callOrder).toEqual(["commit", "audit", "sms"]);
  });

  test("rejects registration when the supplier organization is missing", async () => {
    const useCase = createRegisterPurveyorContactUseCase({
      ...createSubjectAccessDeps(),
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => null),
            setEmployment: mock(async () => ({})),
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => null),
          },
          positionRepository: {
            getPositionByCode: mock(async () => ({ id: 3 })),
          },
          userProfileInvalidation: {
            recordChanges: mock(async () => undefined),
          },
          userRepository: {
            getUserByMobile: mock(async () => null),
            lockPurveyorContactMobile: mock(async () => undefined),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  test("rejects registration when the default supplier position is missing", async () => {
    const useCase = createRegisterPurveyorContactUseCase({
      ...createSubjectAccessDeps(),
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => null),
            setEmployment: mock(async () => ({})),
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => ({ id: 2 })),
          },
          positionRepository: {
            getPositionByCode: mock(async () => null),
          },
          userProfileInvalidation: {
            recordChanges: mock(async () => undefined),
          },
          userRepository: {
            getUserByMobile: mock(async () => null),
            lockPurveyorContactMobile: mock(async () => undefined),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).rejects.toBeInstanceOf(CustomError);
  });

  test("does not create or mark employment when the supplier contact employment already exists", async () => {
    const recordChanges = mock(async () => undefined);
    const setEmployment = mock(async () => ({}));
    const useCase = createRegisterPurveyorContactUseCase({
      ...createSubjectAccessDeps(),
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => ({ id: 10 })),
            setEmployment,
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => ({ id: 2 })),
          },
          positionRepository: {
            getPositionByCode: mock(async () => ({ id: 3 })),
          },
          userProfileInvalidation: { recordChanges },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
            lockPurveyorContactMobile: mock(async () => undefined),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await useCase.execute(input, options);

    expect(setEmployment).not.toHaveBeenCalled();
    expect(recordChanges).not.toHaveBeenCalled();
  });

  test("does not send the supplier welcome message outside production", async () => {
    const sendMessage = mock(async () => true);
    const useCase = createRegisterPurveyorContactUseCase({
      ...createSubjectAccessDeps(),
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage,
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => ({ id: 10 })),
            setEmployment: mock(async () => ({})),
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => ({ id: 2 })),
          },
          positionRepository: {
            getPositionByCode: mock(async () => ({ id: 3 })),
          },
          userProfileInvalidation: {
            recordChanges: mock(async () => undefined),
          },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
            lockPurveyorContactMobile: mock(async () => undefined),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await useCase.execute(input, options);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("propagates an audit failure before attempting the production welcome message", async () => {
    const auditError = new Error("audit unavailable");
    const sendMessage = mock(async () => true);
    const useCase = createRegisterPurveyorContactUseCase({
      ...createSubjectAccessDeps(),
      auditLogWriter: { recordAuditLog: mock(async () => { throw auditError; }) },
      config: { nodeEnv: "production" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage,
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => ({ id: 10 })),
            setEmployment: mock(async () => ({})),
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => ({ id: 2 })),
          },
          positionRepository: {
            getPositionByCode: mock(async () => ({ id: 3 })),
          },
          userProfileInvalidation: {
            recordChanges: mock(async () => undefined),
          },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
            lockPurveyorContactMobile: mock(async () => undefined),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).rejects.toBe(auditError);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("propagates a production welcome message failure after recording the audit event", async () => {
    const smsError = new Error("sms unavailable");
    const recordAuditLog = mock(async () => undefined);
    const useCase = createRegisterPurveyorContactUseCase({
      ...createSubjectAccessDeps(),
      auditLogWriter: { recordAuditLog },
      config: { nodeEnv: "production" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => { throw smsError; }),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          subjectAccessMutation: createSubjectAccessMutation(),
          employmentRepository: {
            getEmploymentByUserOrgPosId: mock(async () => ({ id: 10 })),
            setEmployment: mock(async () => ({})),
          },
          organizationRepository: {
            getOrganizationByCode: mock(async () => ({ id: 2 })),
          },
          positionRepository: {
            getPositionByCode: mock(async () => ({ id: 3 })),
          },
          userProfileInvalidation: {
            recordChanges: mock(async () => undefined),
          },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
            lockPurveyorContactMobile: mock(async () => undefined),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).rejects.toBe(smsError);

    expect(recordAuditLog).toHaveBeenCalledTimes(1);
  });
});
