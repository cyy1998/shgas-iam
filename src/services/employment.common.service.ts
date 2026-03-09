import type { EmploymentQueryDto } from '@schemas/employment.common.type';
import { CustomError } from '@errors/CustomError';
import { employmentMapper } from '@mapper/employment.common.mapper';
import { employmentRepository } from '@repositories/employment.common.repository';
import { organizationRepository } from '@repositories/organization.repository';
import { positionRepository } from '@repositories/position.common.repository';
import { roleRepository } from '@repositories/role.repository';
import { userRepository } from '@repositories/user.common.repository';
import { privilegeService } from './privilege.service';

async function _getEmploymentsDetail(username: string) {
  const employments = await employmentRepository.getEmploymentsByUsername(username);
  const res = [];
  for (const e of employments) {
    const roles = await roleRepository.getRolesByEmploymentId(e.id);
    const privileges = await privilegeService.getPrivilegesByRoleIds(roles.map(r => r.id));
    res.push({
      employment: employmentMapper.entityToDto(e),
      privileges: privileges.map(p => p.privCode),
    });
  }
  return res;
}

export const employmentService = {
  async getEmploymentsByUserAndPrivilege(username: string, privCode: string, codeType: string) {
    const eList = await _getEmploymentsDetail(username);
    if (codeType === 'full') {
      const filtedEList = eList.filter(e => e.privileges.includes(privCode));
      return filtedEList.map(e => e.employment);
    }
    else if (codeType === 'prefix') {
      const filtedEList = eList.filter(e => e.privileges.some(s => s.startsWith(privCode)));
      return filtedEList.map(e => e.employment);
    }
    else {
      const filtedEList = eList.filter(e => e.privileges.some(s => s.endsWith(privCode)));
      return filtedEList.map(e => e.employment);
    }
  },
  async setEmployment(username: string, posCode: string, orgCode: string) {
    const [employment, user, department, company, position] = await Promise.all([
      employmentRepository.getEmploymentByUserOrgPosCode(username, orgCode, posCode),
      userRepository.getUserByUsername(username),
      organizationRepository.getOrganizationByCode(orgCode),
      organizationRepository.getOrganizationByCode(orgCode.slice(0, 2)),
      positionRepository.getPositionByCode(posCode),
    ]);
    if (!user || !department || !company || !position) {
      throw new CustomError('实体不存在');
    }
    if (employment !== null) {
      throw new CustomError('相同任职关系已存在');
    }
    await employmentRepository.setEmployment(user.id, position.id, department.id, company.id);
    return true;
  },
  async searchEmployments(employmentQueryDto: EmploymentQueryDto) {
    const employments = await employmentRepository.searchEmployments(employmentQueryDto);
    const employmentDtos = employments.map(e => employmentMapper.entityToDto(e));
    return employmentDtos;
  },

};
