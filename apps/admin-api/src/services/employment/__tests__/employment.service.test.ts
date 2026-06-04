import { EmploymentStatus, UserStatus } from "@iam/contracts";
import { EmploymentNotEditableError, EmploymentNotFoundError } from "@iam/domain/employment";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const tx = { name: "employment-service-test-tx" };
const transaction = mock(async (callback: (txArg: unknown) => Promise<unknown>) => callback(tx));

mock.module("@iam/db", () => ({
  default: {
    transaction,
  },
}));

const employmentRepository = (Reflect.get(globalThis, "__adminEmploymentRepositoryMock") as {
  createEmploymentRecord: ReturnType<typeof mock>;
  endActiveEmploymentsByUserId: ReturnType<typeof mock>;
  getEmploymentByIdForAdmin: ReturnType<typeof mock>;
  getEmploymentByUserOrgPosId: ReturnType<typeof mock>;
  softDeleteEmployment: ReturnType<typeof mock>;
  unsetPrimariesByUserId: ReturnType<typeof mock>;
  updateEmploymentRecord: ReturnType<typeof mock>;
} | undefined) ?? {
  getEmploymentByUserOrgPosId: mock(),
  getEmploymentByIdForAdmin: mock(),
  createEmploymentRecord: mock(),
  updateEmploymentRecord: mock(),
  unsetPrimariesByUserId: mock(),
  softDeleteEmployment: mock(),
  endActiveEmploymentsByUserId: mock(),
};

const userRepository = (Reflect.get(globalThis, "__adminUserRepositoryMock") as {
  getUserByUsernameForAdmin: ReturnType<typeof mock>;
  updateUserByUsername: ReturnType<typeof mock>;
} | undefined) ?? {
  getUserByUsernameForAdmin: mock(),
  updateUserByUsername: mock(),
};

const organizationRepository = {
  getOrganizationByCode: mock(),
  isOrganizationDescendantOf: mock(),
};

const positionRepository = {
  getPositionByCode: mock(),
};

const roleRepository = (Reflect.get(globalThis, "__adminRoleRepositoryMock") as {
  getRolesByEmploymentId: ReturnType<typeof mock>;
} | undefined) ?? {
  getRolesByEmploymentId: mock(),
};

const privilegeRepository = (Reflect.get(globalThis, "__adminPrivilegeRepositoryMock") as {
  getPrivilegesByRoleIds: ReturnType<typeof mock>;
} | undefined) ?? {
  getPrivilegesByRoleIds: mock(),
};

const auditService = {
  recordAuditLog: mock(),
  resolveAdminAuditContext: mock((context?: unknown) => context ?? { actorType: "system", actorSystemKey: "admin-api" }),
};

Reflect.set(globalThis, "__adminUserRepositoryMock", userRepository);
Reflect.set(globalThis, "__adminEmploymentRepositoryMock", employmentRepository);
Reflect.set(globalThis, "__adminRoleRepositoryMock", roleRepository);
Reflect.set(globalThis, "__adminPrivilegeRepositoryMock", privilegeRepository);

mock.module("@admin-api/services/employment/employment.repository", () => employmentRepository);
mock.module("@admin-api/services/audit/audit.service", () => auditService);
mock.module("@admin-api/services/user/user.repository", () => userRepository);
mock.module("@admin-api/services/organization/organization.repository", () => organizationRepository);
mock.module("@admin-api/services/position/position.repository", () => positionRepository);
mock.module("@admin-api/services/role/role.repository", () => roleRepository);
mock.module("@admin-api/services/privilege/privilege.repository", () => privilegeRepository);

const employmentService = await import("../employment.service");

const startTime = new Date("2026-01-01T00:00:00.000Z");
const transferStartTime = new Date("2026-02-01T00:00:00.000Z");

const user = {
  id: 1,
  username: "alice",
  status: UserStatus.Enable,
};

const dept = {
  id: 10,
  orgCode: "dept-a",
};

const company = {
  id: 20,
  orgCode: "company-a",
};

const newDept = {
  id: 11,
  orgCode: "dept-b",
};

const newCompany = {
  id: 21,
  orgCode: "company-b",
};

const position = {
  id: 30,
  posCode: "dev",
};

const newPosition = {
  id: 31,
  posCode: "lead",
};

const activeEmployment = {
  id: 100,
  userId: user.id,
  orgId: dept.id,
  posId: position.id,
  isPrimary: false,
  startTime,
  endTime: null,
  description: "current employment",
  status: EmploymentStatus.Enable,
};

const primaryEmployment = {
  ...activeEmployment,
  isPrimary: true,
};

const disabledEmployment = {
  ...activeEmployment,
  status: EmploymentStatus.Disable,
  endTime: new Date("2026-01-15T00:00:00.000Z"),
};

const createdEmployment = {
  id: 200,
};

let events: string[] = [];

function applyDefaultMocks() {
  userRepository.getUserByUsernameForAdmin.mockResolvedValue(user);
  userRepository.updateUserByUsername.mockResolvedValue(user);

  organizationRepository.getOrganizationByCode.mockImplementation(async (orgCode: string) => {
    const organizations = new Map([
      [dept.orgCode, dept],
      [company.orgCode, company],
      [newDept.orgCode, newDept],
      [newCompany.orgCode, newCompany],
    ]);
    return organizations.get(orgCode) ?? null;
  });

  positionRepository.getPositionByCode.mockImplementation(async (posCode: string) => {
    const positions = new Map([
      [position.posCode, position],
      [newPosition.posCode, newPosition],
    ]);
    return positions.get(posCode) ?? null;
  });

  organizationRepository.isOrganizationDescendantOf.mockResolvedValue(true);
  employmentRepository.getEmploymentByUserOrgPosId.mockResolvedValue(null);
  employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(activeEmployment);
  employmentRepository.createEmploymentRecord.mockResolvedValue(createdEmployment);
  employmentRepository.updateEmploymentRecord.mockResolvedValue(activeEmployment);
  employmentRepository.unsetPrimariesByUserId.mockResolvedValue(undefined);
  employmentRepository.softDeleteEmployment.mockResolvedValue(undefined);
  employmentRepository.endActiveEmploymentsByUserId.mockResolvedValue(undefined);
}

function resetAllMocks() {
  transaction.mockClear();
  events = [];

  for (const repository of [
    employmentRepository,
    userRepository,
    organizationRepository,
    positionRepository,
    roleRepository,
    privilegeRepository,
  ]) {
    for (const repositoryMock of Object.values(repository)) {
      repositoryMock.mockReset();
    }
  }
  auditService.recordAuditLog.mockReset();
  auditService.resolveAdminAuditContext.mockClear();

  applyDefaultMocks();
}

function createDto(overrides: Record<string, unknown> = {}) {
  return {
    username: user.username,
    deptOrgCode: dept.orgCode,
    companyOrgCode: company.orgCode,
    posCode: position.posCode,
    startTime,
    description: "backend engineer",
    ...overrides,
  };
}

function transferDto(overrides: Record<string, unknown> = {}) {
  return {
    newDeptOrgCode: newDept.orgCode,
    newCompanyOrgCode: newCompany.orgCode,
    newPosCode: newPosition.posCode,
    description: "transfer to lead",
    ...overrides,
  };
}

beforeEach(() => {
  resetAllMocks();
});

describe("employmentService.createEmploymentForAdmin", () => {
  test("rejects when the user does not exist", async () => {
    userRepository.getUserByUsernameForAdmin.mockResolvedValue(null);

    await expect(employmentService.createEmploymentForAdmin(createDto())).rejects.toThrow("用户不存在");

    expect(employmentRepository.getEmploymentByUserOrgPosId).not.toHaveBeenCalled();
    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the organization does not exist", async () => {
    organizationRepository.getOrganizationByCode.mockImplementation(async (orgCode: string) =>
      orgCode === dept.orgCode ? null : dept,
    );

    await expect(employmentService.createEmploymentForAdmin(createDto())).rejects.toThrow("组织不存在");

    expect(employmentRepository.getEmploymentByUserOrgPosId).not.toHaveBeenCalled();
    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the expected ancestor does not contain the organization", async () => {
    organizationRepository.isOrganizationDescendantOf.mockResolvedValue(false);

    await expect(employmentService.createEmploymentForAdmin(createDto())).rejects.toThrow("任职组织不属于期望组织范围");

    expect(employmentRepository.getEmploymentByUserOrgPosId).not.toHaveBeenCalled();
    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the position does not exist", async () => {
    positionRepository.getPositionByCode.mockResolvedValue(null);

    await expect(employmentService.createEmploymentForAdmin(createDto())).rejects.toThrow("岗位不存在");

    expect(employmentRepository.getEmploymentByUserOrgPosId).not.toHaveBeenCalled();
    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when an active user department position relationship already exists", async () => {
    employmentRepository.getEmploymentByUserOrgPosId.mockResolvedValue(activeEmployment);

    await expect(employmentService.createEmploymentForAdmin(createDto())).rejects.toThrow("相同任职关系已存在");

    expect(employmentRepository.getEmploymentByUserOrgPosId).toHaveBeenCalledWith(
      user.id,
      dept.id,
      position.id,
      tx,
    );
    expect(employmentRepository.unsetPrimariesByUserId).not.toHaveBeenCalled();
    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("clears existing primaries and creates the requested primary employment", async () => {
    const result = await employmentService.createEmploymentForAdmin(createDto({ isPrimary: true }));

    expect(result).toEqual({ id: createdEmployment.id });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(userRepository.getUserByUsernameForAdmin).toHaveBeenCalledWith(user.username, tx);
    expect(organizationRepository.getOrganizationByCode).toHaveBeenCalledWith(dept.orgCode, tx);
    expect(organizationRepository.isOrganizationDescendantOf).toHaveBeenCalledWith(dept.orgCode, company.orgCode, tx);
    expect(positionRepository.getPositionByCode).toHaveBeenCalledWith(position.posCode, tx);
    expect(employmentRepository.unsetPrimariesByUserId).toHaveBeenCalledWith(user.id, null, tx);
    expect(employmentRepository.createEmploymentRecord).toHaveBeenCalledWith(
      {
        userId: user.id,
        posId: position.id,
        orgId: dept.id,
        isPrimary: true,
        startTime,
        description: "backend engineer",
        status: EmploymentStatus.Enable,
      },
      tx,
    );
  });

  test("defaults isPrimary to false and description to null when omitted", async () => {
    const result = await employmentService.createEmploymentForAdmin(createDto({
      description: undefined,
      isPrimary: undefined,
    }));

    expect(result).toEqual({ id: createdEmployment.id });
    expect(employmentRepository.unsetPrimariesByUserId).not.toHaveBeenCalled();
    expect(employmentRepository.createEmploymentRecord).toHaveBeenCalledWith(
      {
        userId: user.id,
        posId: position.id,
        orgId: dept.id,
        isPrimary: false,
        startTime,
        description: null,
        status: EmploymentStatus.Enable,
      },
      tx,
    );
  });
});

describe("employmentService.updateEmployment", () => {
  test("rejects when the employment does not exist", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(null);

    await expect(employmentService.updateEmployment(activeEmployment.id, { isPrimary: true })).rejects.toThrow(
      EmploymentNotFoundError,
    );

    expect(employmentRepository.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the employment is disabled", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(disabledEmployment);

    await expect(employmentService.updateEmployment(activeEmployment.id, { isPrimary: true })).rejects.toThrow(
      EmploymentNotEditableError,
    );

    expect(employmentRepository.unsetPrimariesByUserId).not.toHaveBeenCalled();
    expect(employmentRepository.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("clears other primaries only when a non-primary employment becomes primary", async () => {
    const result = await employmentService.updateEmployment(activeEmployment.id, {
      isPrimary: true,
      startTime,
      description: "updated",
      status: EmploymentStatus.Disable,
      endTime: new Date("2026-03-01T00:00:00.000Z"),
    } as never);

    expect(result).toBe(true);
    expect(employmentRepository.unsetPrimariesByUserId).toHaveBeenCalledWith(user.id, activeEmployment.id, tx);
    expect(employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(
      activeEmployment.id,
      {
        isPrimary: true,
        startTime,
        description: "updated",
      },
      tx,
    );
  });

  test("does not clear primaries again when the employment is already primary", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(primaryEmployment);

    const result = await employmentService.updateEmployment(primaryEmployment.id, { isPrimary: true });

    expect(result).toBe(true);
    expect(employmentRepository.unsetPrimariesByUserId).not.toHaveBeenCalled();
    expect(employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(
      primaryEmployment.id,
      {
        isPrimary: true,
        startTime: undefined,
        description: undefined,
      },
      tx,
    );
  });
});

describe("employmentService.updateEmploymentStatus", () => {
  test("rejects when the employment does not exist", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(null);

    await expect(
      employmentService.updateEmploymentStatus(activeEmployment.id, EmploymentStatus.Disable),
    ).rejects.toThrow(EmploymentNotFoundError);

    expect(employmentRepository.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("writes a Date endTime when disabling an employment", async () => {
    const result = await employmentService.updateEmploymentStatus(activeEmployment.id, EmploymentStatus.Disable);

    expect(result).toBe(true);
    expect(employmentRepository.updateEmploymentRecord).toHaveBeenCalledTimes(1);
    const [, patch, txArg] = employmentRepository.updateEmploymentRecord.mock.calls[0]!;
    expect(txArg).toBe(tx);
    expect(patch.status).toBe(EmploymentStatus.Disable);
    expect(patch.endTime).toBeInstanceOf(Date);
  });

  test("clears endTime when restoring a disabled employment to enable or pause", async () => {
    for (const status of [EmploymentStatus.Enable, EmploymentStatus.Pause]) {
      resetAllMocks();
      employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(disabledEmployment);

      const result = await employmentService.updateEmploymentStatus(disabledEmployment.id, status);

      expect(result).toBe(true);
      expect(employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(
        disabledEmployment.id,
        { status, endTime: null },
        tx,
      );
    }
  });

  test("does not write endTime for ordinary non-disable status changes", async () => {
    const result = await employmentService.updateEmploymentStatus(activeEmployment.id, EmploymentStatus.Pause);

    expect(result).toBe(true);
    expect(employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(
      activeEmployment.id,
      { status: EmploymentStatus.Pause },
      tx,
    );
  });
});

describe("employmentService.deleteEmployment", () => {
  test("rejects when the employment does not exist", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(null);

    await expect(employmentService.deleteEmployment(activeEmployment.id)).rejects.toThrow(EmploymentNotFoundError);

    expect(employmentRepository.softDeleteEmployment).not.toHaveBeenCalled();
  });

  test("soft deletes an existing employment", async () => {
    const result = await employmentService.deleteEmployment(activeEmployment.id);

    expect(result).toBe(true);
    expect(employmentRepository.softDeleteEmployment).toHaveBeenCalledWith(activeEmployment.id, tx);
  });
});

describe("employmentService.transferEmployment", () => {
  test("rejects when the original employment does not exist", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(null);

    await expect(employmentService.transferEmployment(activeEmployment.id, transferDto())).rejects.toThrow(
      EmploymentNotFoundError,
    );

    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the original employment is disabled", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(disabledEmployment);

    await expect(employmentService.transferEmployment(disabledEmployment.id, transferDto())).rejects.toThrow(
      EmploymentNotEditableError,
    );

    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the new organization does not exist", async () => {
    organizationRepository.getOrganizationByCode.mockImplementation(async (orgCode: string) =>
      orgCode === newDept.orgCode ? null : newCompany,
    );

    await expect(employmentService.transferEmployment(activeEmployment.id, transferDto())).rejects.toThrow(
      "新任职组织不存在",
    );

    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the new expected ancestor does not contain the organization", async () => {
    organizationRepository.isOrganizationDescendantOf.mockResolvedValue(false);

    await expect(employmentService.transferEmployment(activeEmployment.id, transferDto())).rejects.toThrow(
      "新任职组织不属于期望组织范围",
    );

    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the new position does not exist", async () => {
    positionRepository.getPositionByCode.mockResolvedValue(null);

    await expect(employmentService.transferEmployment(activeEmployment.id, transferDto())).rejects.toThrow(
      "新岗位不存在",
    );

    expect(employmentRepository.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("ends the old employment, inherits primary by default, and creates a new enabled employment", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(primaryEmployment);
    employmentRepository.updateEmploymentRecord.mockImplementation(async () => {
      events.push("end-old");
      return activeEmployment;
    });
    employmentRepository.unsetPrimariesByUserId.mockImplementation(async () => {
      events.push("unset-primary");
    });
    employmentRepository.createEmploymentRecord.mockImplementation(async () => {
      events.push("create-new");
      return createdEmployment;
    });

    const result = await employmentService.transferEmployment(primaryEmployment.id, transferDto());

    expect(result).toEqual({ newEmploymentId: createdEmployment.id });
    expect(events).toEqual(["end-old", "unset-primary", "create-new"]);
    const [, oldPatch, oldTx] = employmentRepository.updateEmploymentRecord.mock.calls[0]!;
    expect(oldTx).toBe(tx);
    expect(oldPatch.status).toBe(EmploymentStatus.Disable);
    expect(oldPatch.endTime).toBeInstanceOf(Date);
    expect(oldPatch.isPrimary).toBe(false);
    expect(employmentRepository.unsetPrimariesByUserId).toHaveBeenCalledWith(user.id, null, tx);
    expect(employmentRepository.createEmploymentRecord).toHaveBeenCalledWith(
      {
        userId: user.id,
        posId: newPosition.id,
        orgId: newDept.id,
        isPrimary: true,
        startTime: oldPatch.endTime,
        description: "transfer to lead",
        status: EmploymentStatus.Enable,
      },
      tx,
    );
  });

  test("forces the new employment to non-primary when inheritPrimary is false", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(primaryEmployment);

    const result = await employmentService.transferEmployment(primaryEmployment.id, transferDto({
      inheritPrimary: false,
      startTime: transferStartTime,
      description: undefined,
    }));

    expect(result).toEqual({ newEmploymentId: createdEmployment.id });
    expect(employmentRepository.unsetPrimariesByUserId).not.toHaveBeenCalled();
    expect(employmentRepository.createEmploymentRecord).toHaveBeenCalledWith(
      {
        userId: user.id,
        posId: newPosition.id,
        orgId: newDept.id,
        isPrimary: false,
        startTime: transferStartTime,
        description: null,
        status: EmploymentStatus.Enable,
      },
      tx,
    );
  });
});

describe("employmentService.setPrimaryEmployment", () => {
  test("rejects when the employment does not exist", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(null);

    await expect(employmentService.setPrimaryEmployment(activeEmployment.id)).rejects.toThrow(EmploymentNotFoundError);

    expect(employmentRepository.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects when the employment is disabled", async () => {
    employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(disabledEmployment);

    await expect(employmentService.setPrimaryEmployment(disabledEmployment.id)).rejects.toThrow(
      EmploymentNotEditableError,
    );

    expect(employmentRepository.unsetPrimariesByUserId).not.toHaveBeenCalled();
    expect(employmentRepository.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("unsets other primaries before marking the employment as primary", async () => {
    employmentRepository.unsetPrimariesByUserId.mockImplementation(async () => {
      events.push("unset-primary");
    });
    employmentRepository.updateEmploymentRecord.mockImplementation(async () => {
      events.push("set-primary");
      return activeEmployment;
    });

    const result = await employmentService.setPrimaryEmployment(activeEmployment.id);

    expect(result).toBe(true);
    expect(events).toEqual(["unset-primary", "set-primary"]);
    expect(employmentRepository.unsetPrimariesByUserId).toHaveBeenCalledWith(user.id, activeEmployment.id, tx);
    expect(employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(
      activeEmployment.id,
      { isPrimary: true },
      tx,
    );
  });
});

describe("employmentService.resignUser", () => {
  test("rejects when the user does not exist", async () => {
    userRepository.getUserByUsernameForAdmin.mockResolvedValue(null);

    await expect(employmentService.resignUser(user.username)).rejects.toThrow("用户不存在");

    expect(employmentRepository.endActiveEmploymentsByUserId).not.toHaveBeenCalled();
    expect(userRepository.updateUserByUsername).not.toHaveBeenCalled();
  });

  test("ends active employments before disabling the user", async () => {
    employmentRepository.endActiveEmploymentsByUserId.mockImplementation(async () => {
      events.push("end-employments");
    });
    userRepository.updateUserByUsername.mockImplementation(async () => {
      events.push("disable-user");
      return user;
    });

    const result = await employmentService.resignUser(user.username);

    expect(result).toBe(true);
    expect(events).toEqual(["end-employments", "disable-user"]);
    expect(employmentRepository.endActiveEmploymentsByUserId).toHaveBeenCalledWith(user.id, tx);
    expect(userRepository.updateUserByUsername).toHaveBeenCalledWith(
      user.username,
      { status: UserStatus.Disable },
      tx,
    );
  });
});
