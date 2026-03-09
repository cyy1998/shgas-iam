import type { FormalOrganizationVo, OrganizationDto, OrganizationEntity } from '@schemas/organization.common.type';
import type { Organization } from '@/db/generated/prisma/client';

export const organizationMapper = {

  entityToDto(org: OrganizationEntity): OrganizationDto {
    return {
      id: org.id,
      orgCode: org.orgCode,
      orgName: org.orgName,
      orgType: org.orgType,
      level: org.level,
      parentId: org.parentId,
      isLeaf: org.children.length === 0,
      parentCode: org.parent ? org.parent.orgCode : null,
      parentName: org.parent ? org.parent.orgName : null,
    };
  },

  dtotoFormalOrganizationVo(orgDto: OrganizationDto, comapny: Organization): FormalOrganizationVo {
    return {
      id: orgDto.id,
      orgCode: orgDto.orgCode,
      orgName: orgDto.orgName,
      orgType: orgDto.orgType,
      level: orgDto.level,
      compCode: comapny.orgCode,
      compName: comapny.orgName,
    };
  },

};
