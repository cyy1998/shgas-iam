import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { DbClient } from "@iam/db";
import type {
  EmploymentAdminCreateDto,
  EmploymentAdminPaginationQueryDto,
  EmploymentTransferDto,
  EmploymentUpdateDto,
} from "./employment.type";
import * as auditService from "@admin-api/services/audit/audit.service";
import * as employmentRepository from "@admin-api/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import * as organizationRepository from "@admin-api/services/organization/organization.repository";
import * as positionRepository from "@admin-api/services/position/position.repository";
import * as privilegeRepository from "@admin-api/services/privilege/privilege.repository";
import * as roleRepository from "@admin-api/services/role/role.repository";
import * as userRepository from "@admin-api/services/user/user.repository";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { EmploymentAlreadyExistsError } from "@iam/api-core/errors/EmploymentAlreadyExistsError";
import { EmploymentNotEditableError } from "@iam/api-core/errors/EmploymentNotEditableError";
import { EmploymentNotFoundError } from "@iam/api-core/errors/EmploymentNotFoundError";
import { OrganizationNotFoundError } from "@iam/api-core/errors/OrganizationNotFoundError";
import { PositionNotFoundError } from "@iam/api-core/errors/PositionNotFoundError";
import { UserNotFoundError } from "@iam/api-core/errors/UserNotFoundError";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import db from "@iam/db";

function resolveCreateOrganizationInput(dto: EmploymentAdminCreateDto) {
  return {
    orgCode: dto.orgCode ?? dto.deptOrgCode,
    expectedAncestorOrgCode: dto.expectedAncestorOrgCode ?? dto.companyOrgCode,
  };
}

function resolveTransferOrganizationInput(dto: EmploymentTransferDto) {
  return {
    orgCode: dto.newOrgCode ?? dto.newDeptOrgCode,
    expectedAncestorOrgCode: dto.expectedAncestorOrgCode ?? dto.newCompanyOrgCode,
  };
}

async function assertExpectedAncestor(
  orgCode: string,
  expectedAncestorOrgCode: string | undefined,
  message: string,
  tx: DbClient,
) {
  if (expectedAncestorOrgCode === undefined) {
    return;
  }
  const matches = await organizationRepository.isOrganizationDescendantOf(orgCode, expectedAncestorOrgCode, tx);
  if (!matches) {
    throw new CustomError(message);
  }
}

async function recordEmploymentAudit(
  action: string,
  target: {
    id: number;
    userId?: number;
    posId?: number;
    orgId?: number;
    isPrimary?: boolean;
    status?: EmploymentStatus;
    user?: { username: string };
    organization?: { assignedOrg?: { orgCode: string } };
    position?: { posCode: string };
  },
  details: Record<string, unknown>,
  tx: Parameters<typeof auditService.recordAuditLog>[1],
  auditContext?: AdminAuditContext,
) {
  await auditService.recordAuditLog({
    ...auditService.resolveAdminAuditContext(auditContext),
    action,
    outcome: "success",
    targetType: "employment",
    targetId: target.id,
    details: {
      userId: target.userId,
      username: target.user?.username,
      posId: target.posId,
      posCode: target.position?.posCode,
      orgId: target.orgId,
      orgCode: target.organization?.assignedOrg?.orgCode,
      isPrimary: target.isPrimary,
      status: target.status,
      ...details,
    },
  }, tx);
}

export async function getEmploymentDetailByIdForAdmin(id: number) {
  const employment = await employmentRepository.getEmploymentByIdForAdmin(id);
  if (employment === null) {
    throw new EmploymentNotFoundError();
  }
  const roles = await roleRepository.getRolesByEmploymentId(employment.id);
  const privileges = await privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
  const dto = EmploymentDetailDtoSchema.parse(toEmploymentDto(employment));
  dto.roles = roles.map(r => r.roleCode);
  dto.privileges = privileges.map(p => p.privilegeCode);
  return dto;
}

export async function searchEmploymentsFuzzyForAdmin(dto: EmploymentAdminPaginationQueryDto) {
  const { rows, total } = await employmentRepository.searchEmploymentsFuzzyForAdminPaged(dto);
  const result = rows.map(e => toEmploymentDto(e));
  const pages = total === 0 ? 0 : Math.ceil(total / dto.pageSize);
  return {
    result,
    total,
    pageNum: dto.pageNum,
    pageSize: dto.pageSize,
    pages,
  };
}

export async function createEmploymentForAdmin(dto: EmploymentAdminCreateDto, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const { orgCode, expectedAncestorOrgCode } = resolveCreateOrganizationInput(dto);
    if (orgCode === undefined) {
      throw new OrganizationNotFoundError("组织不存在");
    }

    const [user, org, position] = await Promise.all([
      userRepository.getUserByUsernameForAdmin(dto.username, tx),
      organizationRepository.getOrganizationByCode(orgCode, tx),
      positionRepository.getPositionByCode(dto.posCode, tx),
    ]);
    if (user === null)
      throw new UserNotFoundError("用户不存在");
    if (org === null)
      throw new OrganizationNotFoundError("组织不存在");
    if (position === null)
      throw new PositionNotFoundError("岗位不存在");
    await assertExpectedAncestor(org.orgCode, expectedAncestorOrgCode, "任职组织不属于期望组织范围", tx);

    const existing = await employmentRepository.getEmploymentByUserOrgPosId(
      user.id,
      org.id,
      position.id,
      tx,
    );
    if (existing !== null) {
      throw new EmploymentAlreadyExistsError("相同任职关系已存在");
    }

    const newIsPrimary = dto.isPrimary ?? false;
    if (newIsPrimary) {
      await employmentRepository.unsetPrimariesByUserId(user.id, null, tx);
    }

    const created = await employmentRepository.createEmploymentRecord(
      {
        userId: user.id,
        posId: position.id,
        orgId: org.id,
        isPrimary: newIsPrimary,
        startTime: dto.startTime,
        description: dto.description ?? null,
        status: EmploymentStatus.Enable,
      },
      tx,
    );
    await recordEmploymentAudit("admin.employment.create", {
      id: created.id,
      userId: user.id,
      posId: position.id,
      orgId: org.id,
      isPrimary: newIsPrimary,
      status: EmploymentStatus.Enable,
      user: { username: user.username },
      organization: { assignedOrg: { orgCode: org.orgCode } },
      position: { posCode: position.posCode },
    }, {
      startTime: dto.startTime,
      description: dto.description ?? null,
    }, tx, auditContext);
    return { id: created.id };
  });
}

export async function updateEmployment(id: number, dto: EmploymentUpdateDto, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    if (existing.status === EmploymentStatus.Disable)
      throw new EmploymentNotEditableError();

    // 若把当前置为主岗，先清同用户其它 primary
    if (dto.isPrimary === true && existing.isPrimary === false) {
      await employmentRepository.unsetPrimariesByUserId(existing.userId, id, tx);
    }

    await employmentRepository.updateEmploymentRecord(
      id,
      {
        isPrimary: dto.isPrimary,
        startTime: dto.startTime,
        description: dto.description,
      },
      tx,
    );
    await recordEmploymentAudit("admin.employment.update", existing, {
      patch: dto,
    }, tx, auditContext);
    return true;
  });
}

export async function updateEmploymentStatus(id: number, status: EmploymentStatus, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();

    const patch: { status: EmploymentStatus; endTime?: Date | null } = { status };
    if (status === EmploymentStatus.Disable) {
      patch.endTime = new Date();
    }
    else if (existing.status === EmploymentStatus.Disable) {
      // 从已结束恢复 → 清空 endTime
      patch.endTime = null;
    }

    await employmentRepository.updateEmploymentRecord(id, patch, tx);
    await recordEmploymentAudit("admin.employment.status_update", existing, {
      patch,
    }, tx, auditContext);
    return true;
  });
}

export async function deleteEmployment(id: number, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    await employmentRepository.softDeleteEmployment(id, tx);
    await recordEmploymentAudit("admin.employment.delete", existing, {
      deleted: true,
    }, tx, auditContext);
    return true;
  });
}

export async function transferEmployment(id: number, dto: EmploymentTransferDto, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    if (existing.status === EmploymentStatus.Disable)
      throw new EmploymentNotEditableError();

    const { orgCode, expectedAncestorOrgCode } = resolveTransferOrganizationInput(dto);
    if (orgCode === undefined) {
      throw new OrganizationNotFoundError("新任职组织不存在");
    }

    const [org, position] = await Promise.all([
      organizationRepository.getOrganizationByCode(orgCode, tx),
      positionRepository.getPositionByCode(dto.newPosCode, tx),
    ]);
    if (org === null)
      throw new OrganizationNotFoundError("新任职组织不存在");
    if (position === null)
      throw new PositionNotFoundError("新岗位不存在");
    await assertExpectedAncestor(org.orgCode, expectedAncestorOrgCode, "新任职组织不属于期望组织范围", tx);

    const inheritPrimary = dto.inheritPrimary ?? true;
    const newIsPrimary = inheritPrimary ? existing.isPrimary : false;

    // 1. 结束旧雇佣
    const now = new Date();
    await employmentRepository.updateEmploymentRecord(
      id,
      { status: EmploymentStatus.Disable, endTime: now, isPrimary: false },
      tx,
    );

    // 2. 若新为主岗，先清该用户其它 primary（此时旧的 isPrimary 已置 false）
    if (newIsPrimary) {
      await employmentRepository.unsetPrimariesByUserId(existing.userId, null, tx);
    }

    // 3. 创建新雇佣
    const created = await employmentRepository.createEmploymentRecord(
      {
        userId: existing.userId,
        posId: position.id,
        orgId: org.id,
        isPrimary: newIsPrimary,
        startTime: dto.startTime ?? now,
        description: dto.description ?? null,
        status: EmploymentStatus.Enable,
      },
      tx,
    );
    await recordEmploymentAudit("admin.employment.transfer", existing, {
      newEmploymentId: created.id,
      newOrgCode: org.orgCode,
      newPosCode: position.posCode,
      inheritPrimary,
      newIsPrimary,
      startTime: dto.startTime ?? now,
    }, tx, auditContext);
    return { newEmploymentId: created.id };
  });
}

export async function setPrimaryEmployment(id: number, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    if (existing.status === EmploymentStatus.Disable)
      throw new EmploymentNotEditableError();

    await employmentRepository.unsetPrimariesByUserId(existing.userId, id, tx);
    await employmentRepository.updateEmploymentRecord(id, { isPrimary: true }, tx);
    await recordEmploymentAudit("admin.employment.set_primary", existing, {
      primary: true,
    }, tx, auditContext);
    return true;
  });
}

export async function resignUser(username: string, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const user = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (user === null)
      throw new UserNotFoundError("用户不存在");

    await employmentRepository.endActiveEmploymentsByUserId(user.id, tx);
    await userRepository.updateUserByUsername(
      username,
      { status: UserStatus.Disable },
      tx,
    );
    await auditService.recordAuditLog({
      ...auditService.resolveAdminAuditContext(auditContext),
      action: "admin.employment.resign_user",
      outcome: "success",
      targetType: "user",
      targetId: user.id,
      targetCode: username,
      details: {
        username,
        resigned: true,
      },
    }, tx);
    return true;
  });
}
