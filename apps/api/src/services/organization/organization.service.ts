import type {
  OrganizationCreateDto,
  OrganizationQueryDto,
  OrganizationUpdateDto,
} from "@api/services/organization/organization.type";
import * as organizationRepository from "@api/services/organization/organization.repository";
import { toOrganizationDto } from "@api/services/organization/organization.schema";
import db from "@iam/db";
import {
  OrganizationAlreadyExistsError,
  OrganizationCodeExistsError,
  OrganizationNotFoundError,
} from "@iam/domain/organization";

export async function getOrganizationByCode(orgCode: string) {
  const organization = await organizationRepository.getOrganizationByCode(orgCode);
  if (organization === null) {
    throw new OrganizationNotFoundError("组织不存在");
  }
  return toOrganizationDto(organization);
}
export async function searchOrganizations(organizationQueryDto: OrganizationQueryDto) {
  const organizations = await organizationRepository.searchOrganizations(organizationQueryDto);
  const orgDtos = organizations.map(o => toOrganizationDto(o));
  return orgDtos;
}

export async function setOrganization(organizationCreateDto: OrganizationCreateDto) {
  return await db.transaction(async (tx) => {
    const newOrg = await organizationRepository.getOrganizationByCode(organizationCreateDto.orgCode, tx);
    const parentOrg = organizationCreateDto.parentCode
      ? await organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode, tx)
      : null;
    if (newOrg !== null) {
      throw new OrganizationAlreadyExistsError("待创建组织已存在");
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
      throw new OrganizationNotFoundError("组织不存在");
    }
    if (data.orgCode && data.orgCode !== orgCode) {
      const conflict = await organizationRepository.getOrganizationByCode(data.orgCode, tx);
      if (conflict !== null) {
        throw new OrganizationCodeExistsError(`组织编码已存在: ${data.orgCode}`);
      }
    }
    await organizationRepository.updateOrganizationByCode(orgCode, data, tx);
    return true;
  });
}
