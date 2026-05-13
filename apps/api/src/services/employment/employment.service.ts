import type {
  EmploymentAdminCreateDto,
  EmploymentAdminPaginationQueryDto,
  EmploymentTransferDto,
  EmploymentUpdateDto,
} from "./employment.type";
import { Status } from "@api/enums/status";
import { CustomError } from "@api/errors/CustomError";
import { EmploymentNotEditableError } from "@api/errors/EmploymentNotEditableError";
import { EmploymentNotFoundError } from "@api/errors/EmploymentNotFoundError";
import { UserNotFoundError } from "@api/errors/UserNotFoundError";
import * as employmentRepository from "@api/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, EmploymentDtoConverterSchema } from "@api/services/employment/employment.schema";
import * as organizationRepository from "@api/services/organization/organization.repository";
import * as positionRepository from "@api/services/position/position.repository";
import * as privilegeRepository from "@api/services/privilege/privilege.repository";
import * as roleRepository from "@api/services/role/role.repository";
import * as userRepository from "@api/services/user/user.repository";
import db from "@iam/db";

export async function getEmploymentDetailByIdForAdmin(id: number) {
  const employment = await employmentRepository.getEmploymentByIdForAdmin(id);
  if (employment === null) {
    throw new EmploymentNotFoundError();
  }
  const roles = await roleRepository.getRolesByEmploymentId(employment.id);
  const privileges = await privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
  const dto = EmploymentDetailDtoSchema.parse(EmploymentDtoConverterSchema.parse(employment));
  dto.roles = roles.map(r => r.roleCode);
  dto.privileges = privileges.map(p => p.privilegeCode);
  return dto;
}

export async function searchEmploymentsFuzzyForAdmin(dto: EmploymentAdminPaginationQueryDto) {
  const { rows, total } = await employmentRepository.searchEmploymentsFuzzyForAdminPaged(dto);
  const result = rows.map(e => EmploymentDtoConverterSchema.parse(e));
  const pages = total === 0 ? 0 : Math.ceil(total / dto.pageSize);
  return {
    result,
    total,
    pageNum: dto.pageNum,
    pageSize: dto.pageSize,
    pages,
  };
}

export async function createEmploymentForAdmin(dto: EmploymentAdminCreateDto) {
  return await db.transaction(async (tx) => {
    const [user, dept, company, position] = await Promise.all([
      userRepository.getUserByUsernameForAdmin(dto.username, tx),
      organizationRepository.getOrganizationByCode(dto.deptOrgCode, tx),
      organizationRepository.getOrganizationByCode(dto.companyOrgCode, tx),
      positionRepository.getPositionByCode(dto.posCode, tx),
    ]);
    if (user === null)
      throw new UserNotFoundError("用户不存在");
    if (dept === null)
      throw new CustomError("部门不存在");
    if (company === null)
      throw new CustomError("公司不存在");
    if (position === null)
      throw new CustomError("岗位不存在");

    const existing = await employmentRepository.getEmploymentByUserOrgPosId(
      user.id,
      dept.id,
      position.id,
      tx,
    );
    if (existing !== null) {
      throw new CustomError("相同任职关系已存在");
    }

    const newIsPrimary = dto.isPrimary ?? false;
    if (newIsPrimary) {
      await employmentRepository.unsetPrimariesByUserId(user.id, null, tx);
    }

    const created = await employmentRepository.createEmploymentRecord(
      {
        userId: user.id,
        posId: position.id,
        orgId: dept.id,
        compId: company.id,
        isPrimary: newIsPrimary,
        startTime: dto.startTime,
        description: dto.description ?? null,
        status: Status.Enable,
      },
      tx,
    );
    return { id: created.id };
  });
}

export async function updateEmployment(id: number, dto: EmploymentUpdateDto) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    if (existing.status === Status.Disable)
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
    return true;
  });
}

export async function updateEmploymentStatus(id: number, status: number) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();

    const patch: { status: number; endTime?: Date | null } = { status };
    if (status === Status.Disable) {
      patch.endTime = new Date();
    }
    else if (existing.status === Status.Disable) {
      // 从已结束恢复 → 清空 endTime
      patch.endTime = null;
    }

    await employmentRepository.updateEmploymentRecord(id, patch, tx);
    return true;
  });
}

export async function deleteEmployment(id: number) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    await employmentRepository.softDeleteEmployment(id, tx);
    return true;
  });
}

export async function transferEmployment(id: number, dto: EmploymentTransferDto) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    if (existing.status === Status.Disable)
      throw new EmploymentNotEditableError();

    const [dept, company, position] = await Promise.all([
      organizationRepository.getOrganizationByCode(dto.newDeptOrgCode, tx),
      organizationRepository.getOrganizationByCode(dto.newCompanyOrgCode, tx),
      positionRepository.getPositionByCode(dto.newPosCode, tx),
    ]);
    if (dept === null)
      throw new CustomError("新部门不存在");
    if (company === null)
      throw new CustomError("新公司不存在");
    if (position === null)
      throw new CustomError("新岗位不存在");

    const inheritPrimary = dto.inheritPrimary ?? true;
    const newIsPrimary = inheritPrimary ? existing.isPrimary : false;

    // 1. 结束旧雇佣
    const now = new Date();
    await employmentRepository.updateEmploymentRecord(
      id,
      { status: Status.Disable, endTime: now, isPrimary: false },
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
        orgId: dept.id,
        compId: company.id,
        isPrimary: newIsPrimary,
        startTime: dto.startTime ?? now,
        description: dto.description ?? null,
        status: Status.Enable,
      },
      tx,
    );
    return { newEmploymentId: created.id };
  });
}

export async function setPrimaryEmployment(id: number) {
  return await db.transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    if (existing.status === Status.Disable)
      throw new EmploymentNotEditableError();

    await employmentRepository.unsetPrimariesByUserId(existing.userId, id, tx);
    await employmentRepository.updateEmploymentRecord(id, { isPrimary: true }, tx);
    return true;
  });
}

export async function resignUser(username: string) {
  return await db.transaction(async (tx) => {
    const user = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (user === null)
      throw new UserNotFoundError("用户不存在");

    await employmentRepository.endActiveEmploymentsByUserId(user.id, tx);
    await userRepository.updateUserByUsername(
      username,
      { status: Status.Disable },
      tx,
    );
    return true;
  });
}
