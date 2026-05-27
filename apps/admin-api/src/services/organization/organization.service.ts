import type {
  OrganizationCreateDto,
  OrganizationPaginationQueryDto,
  OrganizationSelectorQueryDto,
  OrganizationTreeNodeDto,
  OrganizationUpdateDto,
} from "@admin-api/services/organization/organization.type";
import type { OrganizationStatus } from "@iam/contracts";
import * as organizationRepository from "@admin-api/services/organization/organization.repository";
import { toOrganizationDto } from "@admin-api/services/organization/organization.schema";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { OrganizationHasChildrenError } from "@iam/api-core/errors/OrganizationHasChildrenError";
import { OrganizationHasEmploymentError } from "@iam/api-core/errors/OrganizationHasEmploymentError";
import { paginate } from "@iam/api-core/utils";
import { organizationStatusToString } from "@iam/contracts";
import db from "@iam/db";

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
    throw new CustomError("组织不存在", 404);
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

export async function updateOrganizationStatus(orgCode: string, status: OrganizationStatus) {
  return await updateOrganization(orgCode, { status });
}

export async function deleteOrganization(orgCode: string) {
  return await db.transaction(async (tx) => {
    const existing = await organizationRepository.getOrganizationByCodeForAdmin(orgCode, tx);
    if (existing === null) {
      throw new CustomError("组织不存在", 404);
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
    return true;
  });
}
