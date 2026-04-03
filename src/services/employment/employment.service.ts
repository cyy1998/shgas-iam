import type { EmploymentPaginationQueryDto, EmploymentQueryDto } from "./employment.type";
import { CustomError } from "@errors/CustomError";
import * as employmentRepository from "@/services/employment/employment.repository";
import { EmploymentDtoConverterSchema } from "@/services/employment/employment.schema";
import * as organizationRepository from "@/services/organization/organization.repository";
import * as positionRepository from "@/services/position/position.repository";
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
