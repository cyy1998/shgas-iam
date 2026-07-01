import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type {
  OrganizationCreateDto,
  OrganizationPaginationQueryDto,
  OrganizationSelectorQueryDto,
  OrganizationTreeNodeDto,
  OrganizationUpdateDto,
} from "@admin-api/services/organization/organization.type";
import type { OrganizationStatus } from "@iam/contracts";
import type { AdminOrganizationServiceDeps } from "./organization.port";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.service";
import { buildOrganizationAudit } from "@admin-api/services/audit/events/organization.audit";
import { toOrganizationDto } from "@admin-api/services/organization/organization.schema";
import { paginate } from "@iam/api-core/utils";
import { organizationStatusToString } from "@iam/contracts";
import {
  OrganizationAlreadyExistsError,
  OrganizationCodeExistsError,
  OrganizationHasChildrenError,
  OrganizationHasEmploymentError,
  OrganizationNotFoundError,
} from "@iam/domain/organization";

export function createOrganizationService(deps: AdminOrganizationServiceDeps) {
  async function setOrganization(organizationCreateDto: OrganizationCreateDto, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const newOrg = await tx.organizationRepository.getOrganizationByCode(organizationCreateDto.orgCode);
      const parentOrg = organizationCreateDto.parentCode
        ? await tx.organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode)
        : null;
      if (newOrg !== null) {
        throw new OrganizationAlreadyExistsError("待创建组织已存在");
      }
      const created = await tx.organizationRepository.setOrganization(
        organizationCreateDto,
        parentOrg,
      );
      await tx.auditService.recordAuditLog(buildOrganizationAudit("admin.organization.create", created, {
        parentCode: organizationCreateDto.parentCode ?? null,
        orgType: organizationCreateDto.orgType,
      }, auditContext));
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function getOrganizationChildrenForAdmin(
    parentOrgCode: string | null,
    pageNum: number,
    pageSize: number,
  ) {
    const { rows, total } = await deps.organizationRepository.listOrgChildrenByParentCode(
      parentOrgCode,
      pageNum,
      pageSize,
    );
    const result: OrganizationTreeNodeDto[] = rows.map(r => ({
      id: r.id,
      orgCode: r.orgCode,
      orgName: r.orgName,
      orgType: r.orgType,
      status: r.status,
      level: r.level,
      parentId: r.parentId,
      orderNum: r.orderNum,
      isLeaf: r.childCount === 0,
    }));
    const pages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return { result, total, pageNum, pageSize, pages };
  }

  async function getOrganizationDetailByCodeForAdmin(orgCode: string) {
    const org = await deps.organizationRepository.getOrganizationByCodeForAdmin(orgCode);
    if (org === null) {
      throw new OrganizationNotFoundError("组织不存在");
    }
    const employmentCount = await deps.organizationRepository.countActiveEmploymentsByOrgCode(orgCode);
    const dto = toOrganizationDto(org);
    return {
      ...dto,
      statusText: organizationStatusToString[dto.status] ?? "未知",
      childrenCount: org.children.length,
      employmentCount,
    };
  }

  async function searchOrganizationsForAdmin(query: OrganizationPaginationQueryDto) {
    const orgs = await deps.organizationRepository.searchOrganizationsForAdmin(query);
    const vos = orgs.map((o) => {
      const dto = toOrganizationDto(o);
      return {
        ...dto,
        statusText: organizationStatusToString[dto.status] ?? "未知",
        childrenCount: o.children.length,
      };
    });
    return paginate(vos, query);
  }

  async function getOrganizationSelectorNodesForAdmin(query: OrganizationSelectorQueryDto) {
    return await deps.organizationRepository.getOrganizationSelectorNodesForAdmin(query);
  }

  async function updateOrganization(
    orgCode: string,
    data: OrganizationUpdateDto,
    auditContext?: AdminAuditContext,
    action = "admin.organization.update",
  ) {
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
      await tx.auditService.recordAuditLog(buildOrganizationAudit(action, {
        ...existing,
        orgCode: data.orgCode ?? existing.orgCode,
        orgName: data.orgName ?? existing.orgName,
        status: data.status ?? existing.status,
      }, {
        patch: data,
        previousOrgCode: orgCode,
      }, auditContext));
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateOrganizationStatus(
    orgCode: string,
    status: OrganizationStatus,
    auditContext?: AdminAuditContext,
  ) {
    return await updateOrganization(orgCode, { status }, auditContext, "admin.organization.status_update");
  }

  async function deleteOrganization(orgCode: string, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.organizationRepository.getOrganizationByCodeForAdmin(orgCode);
      if (existing === null) {
        throw new OrganizationNotFoundError("组织不存在");
      }
      const childrenCount = await tx.organizationRepository.countActiveChildrenByOrgCode(orgCode);
      if (childrenCount > 0) {
        throw new OrganizationHasChildrenError();
      }
      const employmentCount = await tx.organizationRepository.countActiveEmploymentsByOrgCode(orgCode);
      if (employmentCount > 0) {
        throw new OrganizationHasEmploymentError();
      }
      await tx.organizationRepository.softDeleteOrganizationByCode(orgCode);
      await tx.auditService.recordAuditLog(buildOrganizationAudit("admin.organization.delete", existing, {
        deleted: true,
      }, auditContext));
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return {
    deleteOrganization,
    getOrganizationChildrenForAdmin,
    getOrganizationDetailByCodeForAdmin,
    getOrganizationSelectorNodesForAdmin,
    searchOrganizationsForAdmin,
    setOrganization,
    updateOrganization,
    updateOrganizationStatus,
  };
}

export type OrganizationService = ReturnType<typeof createOrganizationService>;
