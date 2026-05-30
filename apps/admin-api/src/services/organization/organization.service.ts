import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type {
  OrganizationCreateDto,
  OrganizationPaginationQueryDto,
  OrganizationSelectorQueryDto,
  OrganizationTreeNodeDto,
  OrganizationUpdateDto,
} from "@admin-api/services/organization/organization.type";
import type { OrganizationStatus } from "@iam/contracts";
import * as auditService from "@admin-api/services/audit/audit.service";
import * as organizationRepository from "@admin-api/services/organization/organization.repository";
import { toOrganizationDto } from "@admin-api/services/organization/organization.schema";
import { OrganizationAlreadyExistsError } from "@iam/api-core/errors/OrganizationAlreadyExistsError";
import { OrganizationCodeExistsError } from "@iam/api-core/errors/OrganizationCodeExistsError";
import { OrganizationHasChildrenError } from "@iam/api-core/errors/OrganizationHasChildrenError";
import { OrganizationHasEmploymentError } from "@iam/api-core/errors/OrganizationHasEmploymentError";
import { OrganizationNotFoundError } from "@iam/api-core/errors/OrganizationNotFoundError";
import { paginate } from "@iam/api-core/utils";
import { organizationStatusToString } from "@iam/contracts";
import db from "@iam/db";

async function recordOrganizationAudit(
  action: string,
  organization: { id: number; orgCode: string; orgName: string; status?: OrganizationStatus },
  details: Record<string, unknown>,
  tx: Parameters<typeof auditService.recordAuditLog>[1],
  auditContext?: AdminAuditContext,
) {
  await auditService.recordAuditLog({
    ...auditService.resolveAdminAuditContext(auditContext),
    action,
    outcome: "success",
    targetType: "organization",
    targetId: organization.id,
    targetCode: organization.orgCode,
    targetName: organization.orgName,
    details: {
      orgCode: organization.orgCode,
      orgName: organization.orgName,
      status: organization.status,
      ...details,
    },
  }, tx);
}

export async function setOrganization(organizationCreateDto: OrganizationCreateDto, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const newOrg = await organizationRepository.getOrganizationByCode(organizationCreateDto.orgCode, tx);
    const parentOrg = organizationCreateDto.parentCode
      ? await organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode, tx)
      : null;
    if (newOrg !== null) {
      throw new OrganizationAlreadyExistsError("待创建组织已存在");
    }
    const created = await organizationRepository.setOrganization(
      organizationCreateDto,
      parentOrg,
      tx,
    );
    await recordOrganizationAudit("admin.organization.create", created, {
      parentCode: organizationCreateDto.parentCode ?? null,
      orgType: organizationCreateDto.orgType,
    }, tx, auditContext);
    return true;
  });
}

export async function getOrganizationChildrenForAdmin(
  parentOrgCode: string | null,
  pageNum: number,
  pageSize: number,
) {
  const { rows, total } = await organizationRepository.listOrgChildrenByParentCode(
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

export async function getOrganizationDetailByCodeForAdmin(orgCode: string) {
  const org = await organizationRepository.getOrganizationByCodeForAdmin(orgCode);
  if (org === null) {
    throw new OrganizationNotFoundError("组织不存在");
  }
  const employmentCount = await organizationRepository.countActiveEmploymentsByOrgCode(orgCode);
  const dto = toOrganizationDto(org);
  return {
    ...dto,
    statusText: organizationStatusToString[dto.status] ?? "未知",
    childrenCount: org.children.length,
    employmentCount,
  };
}

export async function searchOrganizationsForAdmin(query: OrganizationPaginationQueryDto) {
  const orgs = await organizationRepository.searchOrganizationsForAdmin(query);
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

export async function getOrganizationSelectorNodesForAdmin(query: OrganizationSelectorQueryDto) {
  return await organizationRepository.getOrganizationSelectorNodesForAdmin(query);
}

export async function updateOrganization(
  orgCode: string,
  data: OrganizationUpdateDto,
  auditContext?: AdminAuditContext,
  action = "admin.organization.update",
) {
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
    await recordOrganizationAudit(action, {
      ...existing,
      orgCode: data.orgCode ?? existing.orgCode,
      orgName: data.orgName ?? existing.orgName,
      status: data.status ?? existing.status,
    }, {
      patch: data,
      previousOrgCode: orgCode,
    }, tx, auditContext);
    return true;
  });
}

export async function updateOrganizationStatus(
  orgCode: string,
  status: OrganizationStatus,
  auditContext?: AdminAuditContext,
) {
  return await updateOrganization(orgCode, { status }, auditContext, "admin.organization.status_update");
}

export async function deleteOrganization(orgCode: string, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const existing = await organizationRepository.getOrganizationByCodeForAdmin(orgCode, tx);
    if (existing === null) {
      throw new OrganizationNotFoundError("组织不存在");
    }
    const childrenCount = await organizationRepository.countActiveChildrenByOrgCode(orgCode, tx);
    if (childrenCount > 0) {
      throw new OrganizationHasChildrenError();
    }
    const employmentCount = await organizationRepository.countActiveEmploymentsByOrgCode(orgCode, tx);
    if (employmentCount > 0) {
      throw new OrganizationHasEmploymentError();
    }
    await organizationRepository.softDeleteOrganizationByCode(orgCode, tx);
    await recordOrganizationAudit("admin.organization.delete", existing, {
      deleted: true,
    }, tx, auditContext);
    return true;
  });
}
