import type { EmploymentDto } from "@schemas/employment.common.type";
import type { EmploymentEntity } from "@schemas/employment.entity.type";

export const employmentMapper = {
  entityToDto(employment: EmploymentEntity): EmploymentDto {
    return {
      id: employment.id,
      userId: employment.user.id,
      username: employment.user.username,
      name: employment.user.name,
      posId: employment.position.id,
      posCode: employment.position.posCode,
      posName: employment.position.posName,
      orgId: employment.deptId,
      orgType: employment.deptartment.orgType,
      orgCode: employment.deptartment.orgCode,
      orgName: employment.deptartment.orgName,
      compId: employment.compId,
      compCode: employment.company.orgCode,
      compName: employment.company.orgName,
      isPrimary: employment.isPrimary,
    };
  },
};
