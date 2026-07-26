import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AdminEmploymentServiceDeps, AdminEmploymentTransactionPorts } from "./employment.port";
import type {
  EmploymentAdminCreateDto,
  EmploymentAdminPaginationQueryDto,
  EmploymentTransferDto,
  EmploymentUpdateDto,
} from "./employment.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import { EmploymentStatus } from "@iam/contracts";
import {
  EmploymentAlreadyExistsError,
  EmploymentNotEditableError,
  EmploymentNotFoundError,
  EmploymentOrganizationScopeMismatchError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import { UserNotFoundError } from "@iam/domain/user";

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
  tx: AdminEmploymentTransactionPorts,
) {
  if (expectedAncestorOrgCode === undefined) {
    return;
  }
  const matches = await tx.organizationRepository.isOrganizationDescendantOf(orgCode, expectedAncestorOrgCode);
  if (!matches) {
    throw new EmploymentOrganizationScopeMismatchError(message);
  }
}

export function createEmploymentService(deps: AdminEmploymentServiceDeps) {
  async function getEmploymentDetailByIdForAdmin(id: number) {
    const employment = await deps.employmentRepository.getEmploymentByIdForAdmin(id);
    if (employment === null) {
      throw new EmploymentNotFoundError();
    }
    const rolesByEmployment = await deps.roleAssignmentResolver.resolveEffectiveRoles({
      employmentIds: [employment.id],
    });
    const roles = rolesByEmployment.get(employment.id) ?? [];
    const privileges = await deps.privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
    const dto = EmploymentDetailDtoSchema.parse(toEmploymentDto(employment));
    dto.roles = roles.map(r => r.roleCode);
    dto.privileges = privileges.map(p => p.privilegeCode);
    return dto;
  }

  async function searchEmploymentsFuzzyForAdmin(dto: EmploymentAdminPaginationQueryDto) {
    const { rows, total } = await deps.employmentRepository.searchEmploymentsFuzzyForAdminPaged(dto);
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

  async function createEmploymentForAdmin(dto: EmploymentAdminCreateDto, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const { orgCode, expectedAncestorOrgCode } = resolveCreateOrganizationInput(dto);
      if (orgCode === undefined) {
        throw new OrganizationNotFoundError("组织不存在");
      }

      const [user, org, position] = await Promise.all([
        tx.userRepository.getUserByUsernameForAdmin(dto.username),
        tx.organizationRepository.getOrganizationByCode(orgCode),
        tx.positionRepository.getPositionByCode(dto.posCode),
      ]);
      if (user === null)
        throw new UserNotFoundError("用户不存在");
      if (org === null)
        throw new OrganizationNotFoundError("组织不存在");
      if (position === null)
        throw new PositionNotFoundError("岗位不存在");
      await assertExpectedAncestor(org.orgCode, expectedAncestorOrgCode, "任职组织不属于期望组织范围", tx);

      const existing = await tx.employmentRepository.getEmploymentByUserOrgPosId(
        user.id,
        org.id,
        position.id,
      );
      if (existing !== null) {
        throw new EmploymentAlreadyExistsError("相同任职关系已存在");
      }

      const newIsPrimary = dto.isPrimary ?? false;
      if (newIsPrimary) {
        await tx.employmentRepository.unsetPrimariesByUserId(user.id, null);
      }

      const created = await tx.employmentRepository.createEmploymentRecord({
        userId: user.id,
        posId: position.id,
        orgId: org.id,
        isPrimary: newIsPrimary,
        startTime: dto.startTime,
        description: dto.description ?? null,
        status: EmploymentStatus.Enable,
      });
      await tx.auditService.recordAuditLog(buildEmploymentAudit("admin.employment.create", {
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
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: user.id },
      ]);
      return { id: created.id };
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateEmployment(id: number, dto: EmploymentUpdateDto, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.employmentRepository.getEmploymentByIdForAdmin(id);
      if (existing === null)
        throw new EmploymentNotFoundError();
      if (existing.status === EmploymentStatus.Disable)
        throw new EmploymentNotEditableError();

      if (dto.isPrimary === true && existing.isPrimary === false) {
        await tx.employmentRepository.unsetPrimariesByUserId(existing.userId, id);
      }

      await tx.employmentRepository.updateEmploymentRecord(
        id,
        {
          isPrimary: dto.isPrimary,
          startTime: dto.startTime,
          description: dto.description,
        },
      );
      await tx.auditService.recordAuditLog(buildEmploymentAudit("admin.employment.update", existing, {
        patch: dto,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: existing.userId },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateEmploymentStatus(id: number, status: EmploymentStatus, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.employmentRepository.getEmploymentByIdForAdmin(id);
      if (existing === null)
        throw new EmploymentNotFoundError();

      const patch: { status: EmploymentStatus; endTime?: Date | null } = { status };
      if (status === EmploymentStatus.Disable) {
        patch.endTime = deps.clock.nowDate();
      }
      else if (existing.status === EmploymentStatus.Disable) {
        patch.endTime = null;
      }

      await tx.employmentRepository.updateEmploymentRecord(id, patch);
      await tx.auditService.recordAuditLog(buildEmploymentAudit("admin.employment.status_update", existing, {
        patch,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: existing.userId },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function deleteEmployment(id: number, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.employmentRepository.getEmploymentByIdForAdmin(id);
      if (existing === null)
        throw new EmploymentNotFoundError();
      await tx.employmentRepository.softDeleteEmployment(id);
      await tx.auditService.recordAuditLog(buildEmploymentAudit("admin.employment.delete", existing, {
        deleted: true,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: existing.userId },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function transferEmployment(id: number, dto: EmploymentTransferDto, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.employmentRepository.getEmploymentByIdForAdmin(id);
      if (existing === null)
        throw new EmploymentNotFoundError();
      if (existing.status === EmploymentStatus.Disable)
        throw new EmploymentNotEditableError();

      const { orgCode, expectedAncestorOrgCode } = resolveTransferOrganizationInput(dto);
      if (orgCode === undefined) {
        throw new OrganizationNotFoundError("新任职组织不存在");
      }

      const [org, position] = await Promise.all([
        tx.organizationRepository.getOrganizationByCode(orgCode),
        tx.positionRepository.getPositionByCode(dto.newPosCode),
      ]);
      if (org === null)
        throw new OrganizationNotFoundError("新任职组织不存在");
      if (position === null)
        throw new PositionNotFoundError("新岗位不存在");
      await assertExpectedAncestor(org.orgCode, expectedAncestorOrgCode, "新任职组织不属于期望组织范围", tx);

      const inheritPrimary = dto.inheritPrimary ?? true;
      const newIsPrimary = inheritPrimary ? existing.isPrimary : false;
      const now = deps.clock.nowDate();

      await tx.employmentRepository.updateEmploymentRecord(
        id,
        { status: EmploymentStatus.Disable, endTime: now, isPrimary: false },
      );

      if (newIsPrimary) {
        await tx.employmentRepository.unsetPrimariesByUserId(existing.userId, null);
      }

      const created = await tx.employmentRepository.createEmploymentRecord({
        userId: existing.userId,
        posId: position.id,
        orgId: org.id,
        isPrimary: newIsPrimary,
        startTime: dto.startTime ?? now,
        description: dto.description ?? null,
        status: EmploymentStatus.Enable,
      });
      await tx.auditService.recordAuditLog(buildEmploymentAudit("admin.employment.transfer", existing, {
        newEmploymentId: created.id,
        newOrgCode: org.orgCode,
        newPosCode: position.posCode,
        inheritPrimary,
        newIsPrimary,
        startTime: dto.startTime ?? now,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: existing.userId },
      ]);
      return { newEmploymentId: created.id };
    }, adminAuditTransactionOptions(auditContext));
  }

  async function setPrimaryEmployment(id: number, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.employmentRepository.getEmploymentByIdForAdmin(id);
      if (existing === null)
        throw new EmploymentNotFoundError();
      if (existing.status === EmploymentStatus.Disable)
        throw new EmploymentNotEditableError();

      await tx.employmentRepository.unsetPrimariesByUserId(existing.userId, id);
      await tx.employmentRepository.updateEmploymentRecord(id, { isPrimary: true });
      await tx.auditService.recordAuditLog(buildEmploymentAudit("admin.employment.set_primary", existing, {
        primary: true,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: existing.userId },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return {
    createEmploymentForAdmin,
    deleteEmployment,
    getEmploymentDetailByIdForAdmin,
    searchEmploymentsFuzzyForAdmin,
    setPrimaryEmployment,
    transferEmployment,
    updateEmployment,
    updateEmploymentStatus,
  };
}

export type EmploymentService = ReturnType<typeof createEmploymentService>;
