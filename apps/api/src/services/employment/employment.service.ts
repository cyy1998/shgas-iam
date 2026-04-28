import type {
  EmploymentAdminCreateDto,
  EmploymentAdminPaginationQueryDto,
  EmploymentPaginationQueryDto,
  EmploymentQueryDto,
  EmploymentTransferDto,
  EmploymentUpdateDto,
} from "./employment.type";
import { Status } from "@/enums/status";
import { CustomError } from "@/errors/CustomError";
import { EmploymentNotEditableError } from "@/errors/EmploymentNotEditableError";
import { EmploymentNotFoundError } from "@/errors/EmploymentNotFoundError";
import { UserNotFoundError } from "@/errors/UserNotFoundError";
import { prisma } from "@/db";
import * as employmentRepository from "@/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, EmploymentDtoConverterSchema } from "@/services/employment/employment.schema";
import * as organizationRepository from "@/services/organization/organization.repository";
import * as positionRepository from "@/services/position/position.repository";
import * as privilegeRepository from "@/services/privilege/privilege.repository";
import * as roleRepository from "@/services/role/role.repository";
import * as userRepository from "@/services/user/user.repository";
import { paginate } from "@/utils/page.util";
import * as privilegeService from "../privilege/privilege.service";

async function _getEmploymentsDetail(username: string) {
  const employments = await employmentRepository.getEmploymentsByUsername(username);
  const res = [];
  for (const e of employments) {
    const roles = await roleRepository.getRolesByEmploymentId(e.id);
    const privileges = await privilegeService.getPrivilegesByRoleIds(roles.map(r => r.id));
    res.push({
      employment: EmploymentDtoConverterSchema.parse(e),
      privileges: privileges.map(p => p.privilegeCode),
    });
  }
  return res;
}

export async function getEmploymentsByUserAndPrivilege(username: string, privCode: string, codeType: string) {
  const eList = await _getEmploymentsDetail(username);
  if (codeType === "full") {
    const filtedEList = eList.filter(e => e.privileges.includes(privCode));
    return filtedEList.map(e => e.employment);
  }
  else if (codeType === "prefix") {
    const filtedEList = eList.filter(e => e.privileges.some(s => s.startsWith(privCode)));
    return filtedEList.map(e => e.employment);
  }
  else {
    const filtedEList = eList.filter(e => e.privileges.some(s => s.endsWith(privCode)));
    return filtedEList.map(e => e.employment);
  }
}
export async function setEmployment(username: string, posCode: string, orgCode: string) {
  const [employment, user, department, company, position] = await Promise.all([
    employmentRepository.getEmploymentByUserOrgPosCode(username, orgCode, posCode),
    userRepository.getUserByUsername(username),
    organizationRepository.getOrganizationByCode(orgCode),
    organizationRepository.getOrganizationByCode(orgCode.slice(0, 2)),
    positionRepository.getPositionByCode(posCode),
  ]);
  if (!user || !department || !company || !position) {
    throw new CustomError("实体不存在");
  }
  if (employment !== null) {
    throw new CustomError("相同任职关系已存在");
  }
  await employmentRepository.setEmployment(user.id, position.id, department.id, company.id);
  return true;
}
export async function searchEmployments(employmentQueryDto: EmploymentQueryDto) {
  const employments = await employmentRepository.searchEmployments(employmentQueryDto);
  const employmentDtos = employments.map(e => EmploymentDtoConverterSchema.parse(e));
  return employmentDtos;
}

export async function searchEmploymentsFuzzy(employmentQueryDto: EmploymentPaginationQueryDto) {
  const employments = await employmentRepository.searchEmployments(employmentQueryDto.conditions);
  const employmentDtos = employments.map(e => EmploymentDtoConverterSchema.parse(e));
  return paginate(employmentDtos, employmentQueryDto);
}

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
  return await prisma.$transaction(async (tx) => {
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
  return await prisma.$transaction(async (tx) => {
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
  return await prisma.$transaction(async (tx) => {
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
  return await prisma.$transaction(async (tx) => {
    const existing = await employmentRepository.getEmploymentByIdForAdmin(id, tx);
    if (existing === null)
      throw new EmploymentNotFoundError();
    await employmentRepository.softDeleteEmployment(id, tx);
    return true;
  });
}

export async function transferEmployment(id: number, dto: EmploymentTransferDto) {
  return await prisma.$transaction(async (tx) => {
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
  return await prisma.$transaction(async (tx) => {
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
  return await prisma.$transaction(async (tx) => {
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
