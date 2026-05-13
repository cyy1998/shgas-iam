import type {
  OrganizationCreateDto,
  OrganizationQueryDto,
  OrganizationUpdateDto,
} from "@api/services/organization/organization.type";
import * as organizationRepository from "@api/services/organization/organization.repository";
import { OrganizationDtoConverterSchema } from "@api/services/organization/organization.schema";
import { CustomError } from "@iam/api-core/errors/CustomError";
import db from "@iam/db";

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
  return await db.transaction(async (tx) => {
    const newOrg = await organizationRepository.getOrganizationByCode(organizationCreateDto.orgCode, tx);
    const parentOrg = organizationCreateDto.parentCode
      ? await organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode, tx)
      : null;
    if (newOrg !== null) {
      throw new CustomError("待创建组织已存在");
    }
    await organizationRepository.setOrganization(
      organizationCreateDto,
      parentOrg,
      tx,
    );
    return true;
  });
}

export async function updateOrganization(orgCode: string, data: OrganizationUpdateDto) {
  return await db.transaction(async (tx) => {
    const existing = await organizationRepository.getOrganizationByCodeForAdmin(orgCode, tx);
    if (existing === null) {
      throw new CustomError("组织不存在", 404);
    }
    if (data.orgCode && data.orgCode !== orgCode) {
      const conflict = await organizationRepository.getOrganizationByCode(data.orgCode, tx);
      if (conflict !== null) {
        throw new CustomError(`组织编码已存在: ${data.orgCode}`);
      }
    }
    await organizationRepository.updateOrganizationByCode(orgCode, data, tx);
    return true;
  });
}
