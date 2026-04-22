import type { PrismaTransaction } from "@/db";
import type { Organization } from "@/db/generated/prisma/client";
import type { OrganizationCreateDto, OrganizationQueryDto } from "@/services/organization/organization.type";
import { OrganizationType } from "@enums/organization.type";
import { Status } from "@enums/status";
import { prisma } from "@/db";

export async function searchFormalOrganizations(orgCode: string, orgLevel: number, tx: PrismaTransaction = prisma) {
  return await tx.organization.findMany({
    where: {
      descendantClosures: {
        some: {
          ancestor: {
            orgCode,
          },
        },
      },
      orgType: {
        notIn: [OrganizationType.Virtual, OrganizationType.External],
      },
      level: orgLevel,
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      parent: true,
      children: true,
    },
  });
}
export async function getOrganizationByCode(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.organization.findFirst({
    where: {
      orgCode,
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      parent: true,
      children: true,
    },
  });
}
export async function getOrganizationById(id: number, tx: PrismaTransaction = prisma) {
  return await tx.organization.findFirst({
    where: {
      id,
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      parent: true,
      children: true,
    },
  });
}
export async function searchOrganizations(
  query: OrganizationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.organization.findMany({
    where: {
      descendantClosures: {
        some: {
          ancestor: {
            orgCode: {
              in: query.ancestorCodes,
            },
          },
          depth: {
            in: query.ancestorDepths,
          },
        },
      },
      ancestorClosures: {
        some: {
          descendant: {
            orgCode: {
              in: query.descendantCodes,
            },
          },
          depth: {
            in: query.descendantDepths,
          },
        },
      },
      level: {
        in: query.orgLevels,
      },
      orgType: {
        in: query.orgTypes,
      },
      orgCode: {
        in: query.orgCodes,
      },
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      parent: true,
      children: true,
    },
  });
}
export async function getOrganizationsByParentId(parentId: number, tx: PrismaTransaction = prisma) {
  return await tx.organization.findMany({
    where: {
      parentId,
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      parent: true,
      children: true,
    },
  });
}
export async function getOrganizationsByParentsCode(parentCodes: string[], tx: PrismaTransaction = prisma) {
  return await tx.organization.findMany({
    where: {
      parent: {
        orgCode: {
          in: parentCodes,
        },
      },
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      parent: true,
      children: true,
    },
  });
}
export async function setOrganization(
  organizationCreateDto: OrganizationCreateDto,
  parentOrganization: Organization | null,
  tx: PrismaTransaction = prisma,
) {
  const { parentCode, ...org } = organizationCreateDto;
  const newOrganization = await tx.organization.create({
    data: org,
  });
  const path = `${parentOrganization ? parentOrganization.path : ""}/${newOrganization.id}`;
  const level = parentOrganization ? parentOrganization.level + 1 : 1;
  const updatedOrganization = await tx.organization.update({
    where: {
      id: newOrganization.id,
      status: Status.Enable,
      isDelete: false,
    },
    data: {
      path,
      level,
      parentId: parentOrganization?.id,
    },
  });
  const closureRelations = [];
  const parentAncestors = await tx.organizationClosure.findMany({
    where: {
      descendantId: parentOrganization?.id,
    },
    select: { ancestorId: true, depth: true },
  });
  parentAncestors.forEach((rel) => {
    closureRelations.push({
      ancestorId: rel.ancestorId,
      descendantId: newOrganization.id,
      depth: rel.depth + 1,
    });
  });
  closureRelations.push({
    ancestorId: newOrganization.id,
    descendantId: newOrganization.id,
    depth: 0,
  });
  if (closureRelations.length > 0) {
    await tx.organizationClosure.createMany({
      data: closureRelations,
      skipDuplicates: true,
    });
  }
  return updatedOrganization;
}

/**
 * Admin: 返回指定父节点的直接子组织（含每个子节点的下级数量，供前端 isLeaf 判定）。
 * parentOrgCode 为 null 时返回根组织（parentId = -1）。
 */
export async function listOrgChildrenByParentCode(
  parentOrgCode: string | null,
  tx: PrismaTransaction = prisma,
) {
  let parentId: number;
  if (parentOrgCode === null) {
    parentId = -1;
  }
  else {
    const parent = await tx.organization.findFirst({
      where: { orgCode: parentOrgCode, isDelete: false },
      select: { id: true },
    });
    if (parent === null) {
      return [];
    }
    parentId = parent.id;
  }

  const rows = await tx.organization.findMany({
    where: { isDelete: false, parentId },
    orderBy: [
      { orderNum: "asc" },
      { id: "asc" },
    ],
  });

  if (rows.length === 0) {
    return [];
  }

  const grandchildCounts = await tx.organization.groupBy({
    by: ["parentId"],
    where: {
      isDelete: false,
      parentId: { in: rows.map(r => r.id) },
    },
    _count: { _all: true },
  });
  const countMap = new Map(grandchildCounts.map(c => [c.parentId, c._count._all]));

  return rows.map(r => ({
    ...r,
    childCount: countMap.get(r.id) ?? 0,
  }));
}

/** Admin: 按 orgCode 查询（不过滤 status） */
export async function getOrganizationByCodeForAdmin(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.organization.findFirst({
    where: { orgCode, isDelete: false },
    include: {
      parent: true,
      children: { where: { isDelete: false } },
    },
  });
}

/** Admin: 扁平分页搜索（多维过滤，支持关键字模糊） */
export async function searchOrganizationsForAdmin(
  query: {
    conditions: {
      fuzzyConditions: { text?: string };
      exactConditions: { orgType?: string; status?: number; parentOrgCode?: string };
    };
  },
  tx: PrismaTransaction = prisma,
) {
  const { fuzzyConditions, exactConditions } = query.conditions;
  return await tx.organization.findMany({
    where: {
      isDelete: false,
      ...(exactConditions.orgType ? { orgType: exactConditions.orgType } : {}),
      ...(exactConditions.status !== undefined ? { status: exactConditions.status } : {}),
      ...(exactConditions.parentOrgCode
        ? { parent: { orgCode: exactConditions.parentOrgCode } }
        : {}),
      ...(fuzzyConditions.text
        ? {
            OR: [
              { orgCode: { contains: fuzzyConditions.text } },
              { orgName: { contains: fuzzyConditions.text } },
            ],
          }
        : {}),
    },
    include: {
      parent: true,
      children: { where: { isDelete: false } },
    },
    orderBy: [
      { level: "asc" },
      { orderNum: "asc" },
      { id: "asc" },
    ],
  });
}

export async function updateOrganizationByCode(
  orgCode: string,
  data: { orgName?: string; orgType?: string; status?: number },
  tx: PrismaTransaction = prisma,
) {
  return await tx.organization.updateMany({
    where: { orgCode, isDelete: false },
    data,
  });
}

export async function softDeleteOrganizationByCode(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.organization.updateMany({
    where: { orgCode, isDelete: false },
    data: { isDelete: true },
  });
}

/** 直接子节点数量（不考虑更深后代） */
export async function countActiveChildrenByOrgCode(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.organization.count({
    where: {
      isDelete: false,
      parent: { orgCode, isDelete: false },
    },
  });
}

/** 组织作为 dept 或 comp 关联的未结束雇佣数 */
export async function countActiveEmploymentsByOrgCode(orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.employment.count({
    where: {
      isDelete: false,
      OR: [
        { deptartment: { orgCode, isDelete: false } },
        { company: { orgCode, isDelete: false } },
      ],
    },
  });
}
