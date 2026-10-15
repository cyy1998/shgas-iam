import { toOrganizationDto } from "@api/services/organization/organization.schema";
import type { OrganizationCreateDto, OrganizationUpdateDto } from "@api/services/organization/organization.type";
import {
  OrganizationAlreadyExistsError,
  OrganizationCodeExistsError,
  OrganizationNotFoundError,
} from "@iam/domain/organization";
import type { ApiOrganizationSearchChangedField, OrganizationServiceDeps } from "./organization.port";

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

  async function setOrganization(organizationCreateDto: OrganizationCreateDto) {
    return await deps.uow.transaction(async (tx) => {
      const newOrg = await tx.organizationRepository.getAnyOrganizationByCode(organizationCreateDto.orgCode);
      const parentOrg = organizationCreateDto.parentCode
        ? await tx.organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode)
        : null;
      if (newOrg !== null) {
        throw new OrganizationAlreadyExistsError("待创建组织已存在");
      }
      const created = await tx.organizationRepository.setOrganization(organizationCreateDto, parentOrg);
      await tx.organizationSearchInvalidation.recordChanges([{ kind: "created", organizationId: created.id }]);
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
        const conflict = await tx.organizationRepository.getAnyOrganizationByCode(data.orgCode);
        if (conflict !== null) {
          throw new OrganizationCodeExistsError(`组织编码已存在: ${data.orgCode}`);
        }
      }
      const updated = await tx.organizationRepository.updateOrganizationByCode(orgCode, data);
      // Internal writes keep their existing unlocked precheck. A same-value patch can
      // overwrite a concurrent change, so register every explicitly written public field.
      const changedFields: ApiOrganizationSearchChangedField[] = [];
      if (data.orgCode !== undefined) changedFields.push("code");
      if (data.orgName !== undefined) changedFields.push("name");
      if (data.orgType !== undefined) changedFields.push("type");
      if (data.status !== undefined) changedFields.push("status");
      // A concurrent code reassignment can change the target after the precheck.
      // Register only the stable identity returned by the actual source update.
      if (updated !== null) {
        await tx.organizationSearchInvalidation.recordChanges([
          { kind: "updated", organizationId: updated.id, changedFields },
        ]);
      }
      await tx.userProfileInvalidation.recordChanges([{ kind: "organization", organizationId: existing.id }]);
      return true;
    });
  }

  return {
    findOrganizationByCode,
    getOrganizationByCode,
    setOrganization,
    updateOrganization,
  };
}

export type OrganizationService = ReturnType<typeof createOrganizationService>;
