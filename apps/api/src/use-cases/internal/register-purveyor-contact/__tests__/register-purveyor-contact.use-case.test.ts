import { CustomError } from "@iam/api-core/errors/CustomError";
import { UserProfileDirtyReason } from "@iam/contracts";
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

describe("RegisterPurveyorContactUseCase", () => {
  test("adds employment for an existing supplier contact and marks the profile dirty", async () => {
    const profileDirtyMarker = {
      markUsersDirty: mock(async () => ({ marked: 1, userIds: [7] })),
    };
    const setEmployment = mock(async () => ({}));
    const useCase = createRegisterPurveyorContactUseCase({
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
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker,
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
            setUser: mock(async () => {
              throw new Error("setUser should not be called");
            }),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).resolves.toBe(true);

    expect(setEmployment).toHaveBeenCalledWith(7, 3, 2);
    expect(profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      userIds: [7],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
      afterCommit: expect.any(Object),
    });
  });

  test("creates a new external supplier contact and marks user and employment facts dirty", async () => {
    const profileDirtyMarker = {
      markUsersDirty: mock(async () => ({ marked: 1, userIds: [9] })),
    };
    const setUser = mock(async () => ({ id: 9 }));
    const setEmployment = mock(async () => ({}));
    const useCase = createRegisterPurveyorContactUseCase({
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
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker,
          userRepository: {
            getUserByMobile: mock(async () => null),
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
    });
    expect(setEmployment).toHaveBeenCalledWith(9, 3, 2);
    expect(profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      userIds: [9],
      reasonCodes: [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
      afterCommit: expect.any(Object),
    });
  });

  test("records the supplier contact audit with request context and redacted mobile", async () => {
    const recordAuditLog = mock(async () => undefined);
    const useCase = createRegisterPurveyorContactUseCase({
      auditLogWriter: { recordAuditLog },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker: {
            markUsersDirty: mock(async () => ({ marked: 0, userIds: [] })),
          },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
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
            afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
            profileDirtyMarker: {
              markUsersDirty: mock(async () => ({ marked: 0, userIds: [] })),
            },
            userRepository: {
              getUserByMobile: mock(async () => ({ id: 7 })),
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
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker: {
            markUsersDirty: mock(async () => ({ marked: 0, userIds: [] })),
          },
          userRepository: {
            getUserByMobile: mock(async () => null),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  test("rejects registration when the default supplier position is missing", async () => {
    const useCase = createRegisterPurveyorContactUseCase({
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker: {
            markUsersDirty: mock(async () => ({ marked: 0, userIds: [] })),
          },
          userRepository: {
            getUserByMobile: mock(async () => null),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).rejects.toBeInstanceOf(CustomError);
  });

  test("does not create or mark employment when the supplier contact employment already exists", async () => {
    const markUsersDirty = mock(async () => ({ marked: 0, userIds: [] }));
    const setEmployment = mock(async () => ({}));
    const useCase = createRegisterPurveyorContactUseCase({
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => true),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker: { markUsersDirty },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await useCase.execute(input, options);

    expect(setEmployment).not.toHaveBeenCalled();
    expect(markUsersDirty).not.toHaveBeenCalled();
  });

  test("does not send the supplier welcome message outside production", async () => {
    const sendMessage = mock(async () => true);
    const useCase = createRegisterPurveyorContactUseCase({
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      config: { nodeEnv: "test" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage,
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker: {
            markUsersDirty: mock(async () => ({ marked: 0, userIds: [] })),
          },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
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
      auditLogWriter: { recordAuditLog: mock(async () => { throw auditError; }) },
      config: { nodeEnv: "production" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage,
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker: {
            markUsersDirty: mock(async () => ({ marked: 0, userIds: [] })),
          },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
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
      auditLogWriter: { recordAuditLog },
      config: { nodeEnv: "production" },
      mobileService: {
        getPurveyorWelcomeMessage: mock(() => "welcome"),
        sendMessage: mock(async () => { throw smsError; }),
      },
      uow: {
        transaction: mock(async (callback: any) => await callback({
          afterCommit: { bestEffort: mock(() => undefined), required: mock(() => undefined) },
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
          profileDirtyMarker: {
            markUsersDirty: mock(async () => ({ marked: 0, userIds: [] })),
          },
          userRepository: {
            getUserByMobile: mock(async () => ({ id: 7 })),
            setUser: mock(async () => ({ id: 9 })),
          },
        })),
      },
    } as never);

    await expect(useCase.execute(input, options)).rejects.toBe(smsError);

    expect(recordAuditLog).toHaveBeenCalledTimes(1);
  });
});
