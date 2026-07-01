import type {
  OrganizationCreateDto,
  OrganizationQueryDto,
  OrganizationUpdateDto,
} from "@api/services/organization/organization.type";
import type { OrganizationServiceDeps } from "./organization.port";
import { toOrganizationDto } from "@api/services/organization/organization.schema";
import { UserProfileDirtyReason, UserProfileScopeType } from "@iam/contracts";
import {
  OrganizationAlreadyExistsError,
  OrganizationCodeExistsError,
  OrganizationNotFoundError,
} from "@iam/domain/organization";

export function createOrganizationService(deps: OrganizationServiceDeps) {
  async function findOrganizationByCode(orgCode: string) {
    const organization = await deps.organizationRepository.getOrganizationByCode(orgCode);
    if (organization === null) {
      return null;
    }
    return toOrganizationDto(organization);
  }

  async function getOrganizationByCode(orgCode: string) {
    const organization = await findOrganizationByCode(orgCode);
    if (organization === null) {
      throw new OrganizationNotFoundError("组织不存在");
    }
    return organization;
  }

  async function searchOrganizations(organizationQueryDto: OrganizationQueryDto) {
    const organizations = await deps.organizationRepository.searchOrganizations(organizationQueryDto);
    const orgDtos = organizations.map(o => toOrganizationDto(o));
    return orgDtos;
  }

  async function setOrganization(organizationCreateDto: OrganizationCreateDto) {
    return await deps.uow.transaction(async (tx) => {
      const newOrg = await tx.organizationRepository.getOrganizationByCode(organizationCreateDto.orgCode);
      const parentOrg = organizationCreateDto.parentCode
        ? await tx.organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode)
        : null;
      if (newOrg !== null) {
        throw new OrganizationAlreadyExistsError("待创建组织已存在");
      }
      await tx.organizationRepository.setOrganization(
        organizationCreateDto,
        parentOrg,
      );
      return true;
    });
  }

  async function updateOrganization(orgCode: string, data: OrganizationUpdateDto) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.organizationRepository.getOrganizationByCodeForAdmin(orgCode);
      if (existing === null) {
        throw new OrganizationNotFoundError("组织不存在");
      }
      if (data.orgCode && data.orgCode !== orgCode) {
        const conflict = await tx.organizationRepository.getOrganizationByCode(data.orgCode);
        if (conflict !== null) {
          throw new OrganizationCodeExistsError(`组织编码已存在: ${data.orgCode}`);
        }
      }
      await tx.organizationRepository.updateOrganizationByCode(orgCode, data);
      await tx.profileDirtyMarker.markScopeDirty({
        scope: { scopeType: UserProfileScopeType.OrganizationId, scopeId: existing.id },
        reasonCodes: [UserProfileDirtyReason.OrganizationUpdated],
        afterCommit: tx.afterCommit,
      });
      return true;
    });
  }

  return {
    findOrganizationByCode,
    getOrganizationByCode,
    searchOrganizations,
    setOrganization,
    updateOrganization,
  };
}

export type OrganizationService = ReturnType<typeof createOrganizationService>;
