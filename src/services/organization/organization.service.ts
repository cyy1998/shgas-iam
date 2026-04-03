import type { OrganizationCreateDto, OrganizationQueryDto } from "@/services/organization/organization.type";
import { CustomError } from "@errors/CustomError";
import { prisma } from "@/db";
import * as organizationRepository from "@/services/organization/organization.repository";
import { OrganizationDtoConverterSchema } from "@/services/organization/organization.schema";

export async function getFormalOrganizationsByCode(orgCode: string, orgLevel: number) {
  const organizations = await organizationRepository.searchFormalOrganizations(orgCode, orgLevel);
  const orgDtos = organizations.map(o => OrganizationDtoConverterSchema.parse(o));
  return orgDtos;
}
export async function getOrganizationByCode(orgCode: string) {
  const organization = await organizationRepository.getOrganizationByCode(orgCode);
  if (organization === null) {
    throw new CustomError("组织不存在");
  }
  return OrganizationDtoConverterSchema.parse(organization);
}
export async function searchOrganizations(organizationQueryDto: OrganizationQueryDto) {
  const organizations = await organizationRepository.searchOrganizations(organizationQueryDto);
  const orgDtos = organizations.map(o => OrganizationDtoConverterSchema.parse(o));
  return orgDtos;
}

export async function setOrganization(organizationCreateDto: OrganizationCreateDto) {
  return await prisma.$transaction(async (tx) => {
    const [newOrg, parentOrg] = await Promise.all([
      organizationRepository.getOrganizationByCode(organizationCreateDto.orgCode, tx),
      organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode, tx),
    ]);
    if (newOrg !== null) {
      throw new CustomError("待创建组织已存在");
    }
    if (parentOrg === null) {
      throw new CustomError("有效父组织不存在");
    }
    await organizationRepository.setOrganization(
      organizationCreateDto.orgCode,
      organizationCreateDto.orgName,
      parentOrg.level + 1,
      organizationCreateDto.orgType,
      parentOrg,
      tx,
    );
    return true;
  });
}
