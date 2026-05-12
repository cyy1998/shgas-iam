import type { DbClient } from "@api/db";
import type { Organization } from "@api/db/schema";
import type { OrganizationCreateDto, OrganizationQueryDto } from "@api/services/organization/organization.type";
import db from "@api/db";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@api/db/query-utils";
import { employments, organizationClosures, organizations } from "@api/db/schema";
import { Status } from "@api/enums/status";
import { and, count, eq, exists, gt, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type OrganizationWithRelations = Organization & {
  parent: Organization | null;
  children: Organization[];
};

async function attachOrganizationRelations(
  rows: Organization[],
  tx: DbClient,
  options: { activeChildrenOnly?: boolean } = {},
): Promise<OrganizationWithRelations[]> {
  if (rows.length === 0) {
    return [];
  }

  const parentIds = [...new Set(rows.map(row => row.parentId).filter(id => id > 0))];
  const rowIds = rows.map(row => row.id);

  const [parents, children] = await Promise.all([
    parentIds.length === 0
      ? Promise.resolve([])
      : tx.select().from(organizations).where(inArray(organizations.id, parentIds)),
    tx.select().from(organizations).where(and(
      inArray(organizations.parentId, rowIds),
      options.activeChildrenOnly ? eq(organizations.isDelete, false) : undefined,
    )),
  ]);

  const parentMap = new Map(parents.map(parent => [parent.id, parent]));
  const childrenMap = new Map<number, Organization[]>();
  for (const child of children) {
    const orgChildren = childrenMap.get(child.parentId) ?? [];
    orgChildren.push(child);
    childrenMap.set(child.parentId, orgChildren);
  }

  return rows.map(row => ({
    ...row,
    parent: parentMap.get(row.parentId) ?? null,
    children: childrenMap.get(row.id) ?? [],
  }));
}

export async function getOrganizationByCode(orgCode: string, tx: DbClient = db) {
  const rows = await tx.select().from(organizations).where(and(
    eq(organizations.orgCode, orgCode),
    eq(organizations.status, Status.Enable),
    eq(organizations.isDelete, false),
  )).limit(1);
  return firstRow(await attachOrganizationRelations(rows, tx)) ?? null;
}

export async function searchOrganizations(
  query: OrganizationQueryDto,
  tx: DbClient = db,
) {
  const ancestor = alias(organizations, "ancestor_filter");
  const descendant = alias(organizations, "descendant_filter");
  const rows = await tx.select().from(organizations).where(and(
    query.ancestorCodes === undefined
      ? undefined
      : exists(
          db.select({ value: sql`1` })
            .from(organizationClosures)
            .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
            .where(and(
              eq(organizationClosures.descendantId, organizations.id),
              inArrayIf(ancestor.orgCode, query.ancestorCodes),
              inArrayIf(organizationClosures.depth, query.ancestorDepths),
            )),
        ),
    query.descendantCodes === undefined
      ? undefined
      : exists(
          db.select({ value: sql`1` })
            .from(organizationClosures)
            .innerJoin(descendant, eq(organizationClosures.descendantId, descendant.id))
            .where(and(
              eq(organizationClosures.ancestorId, organizations.id),
              inArrayIf(descendant.orgCode, query.descendantCodes),
              inArrayIf(organizationClosures.depth, query.descendantDepths),
            )),
        ),
    inArrayIf(organizations.level, query.orgLevels),
    inArrayIf(organizations.orgType, query.orgTypes),
    inArrayIf(organizations.orgCode, query.orgCodes),
    eq(organizations.status, Status.Enable),
    eq(organizations.isDelete, false),
  ));
  return await attachOrganizationRelations(rows, tx);
}

export async function setOrganization(
  organizationCreateDto: OrganizationCreateDto,
  parentOrganization: Organization | null,
  tx: DbClient = db,
) {
  const { parentCode, ...org } = organizationCreateDto;
  const newOrganization = firstRow(await tx.insert(organizations).values(org).returning())!;
  const path = `${parentOrganization ? parentOrganization.path : ""}/${newOrganization.id}`;
  const level = parentOrganization ? parentOrganization.level + 1 : 1;
  const updatedOrganization = firstRow(await tx
    .update(organizations)
    .set({
      path,
      level,
      parentId: parentOrganization?.id ?? -1,
    })
    .where(and(
      eq(organizations.id, newOrganization.id),
      eq(organizations.status, Status.Enable),
      eq(organizations.isDelete, false),
    ))
    .returning())!;

  const parentAncestors = parentOrganization === null
    ? []
    : await tx
        .select({
          ancestorId: organizationClosures.ancestorId,
          depth: organizationClosures.depth,
        })
        .from(organizationClosures)
        .where(eq(organizationClosures.descendantId, parentOrganization.id));

  const closureRelations = parentAncestors.map(rel => ({
    ancestorId: rel.ancestorId,
    descendantId: newOrganization.id,
    depth: rel.depth + 1,
  }));
  closureRelations.push({
    ancestorId: newOrganization.id,
    descendantId: newOrganization.id,
    depth: 0,
  });

  await tx.insert(organizationClosures).values(closureRelations).onConflictDoNothing();
  return firstRow(await attachOrganizationRelations([updatedOrganization], tx))!;
}

export async function listOrgChildrenByParentCode(
  parentOrgCode: string | null,
  pageNum: number,
  pageSize: number,
  tx: DbClient = db,
) {
  let parentId: number;
  if (parentOrgCode === null) {
    parentId = -1;
  }
  else {
    const parent = await tx.query.organizations.findFirst({
      columns: { id: true },
      where: { orgCode: parentOrgCode, isDelete: false },
    });
    if (parent === undefined) {
      return { rows: [], total: 0 };
    }
    parentId = parent.id;
  }

  const where = and(eq(organizations.isDelete, false), eq(organizations.parentId, parentId));
  const [rows, totalRows] = await Promise.all([
    tx
      .select()
      .from(organizations)
      .where(where)
      .orderBy(organizations.orderNum, organizations.id)
      .limit(pageSize)
      .offset((pageNum - 1) * pageSize),
    tx.select({ value: count() }).from(organizations).where(where),
  ]);
  const total = firstRow(totalRows)?.value ?? 0;

  if (rows.length === 0) {
    return { rows: [], total };
  }

  const grandchildCounts = await tx
    .select({ parentId: organizations.parentId, value: count() })
    .from(organizations)
    .where(and(eq(organizations.isDelete, false), inArray(organizations.parentId, rows.map(r => r.id))))
    .groupBy(organizations.parentId);
  const countMap = new Map(grandchildCounts.map(c => [c.parentId, c.value]));

  return {
    rows: rows.map(r => ({
      ...r,
      childCount: countMap.get(r.id) ?? 0,
    })),
    total,
  };
}

export async function getOrganizationByCodeForAdmin(orgCode: string, tx: DbClient = db) {
  const rows = await tx.select().from(organizations).where(and(
    eq(organizations.orgCode, orgCode),
    eq(organizations.isDelete, false),
  )).limit(1);
  return firstRow(await attachOrganizationRelations(rows, tx, { activeChildrenOnly: true })) ?? null;
}

export async function searchOrganizationsForAdmin(
  query: {
    conditions: {
      fuzzyConditions: { text?: string };
      exactConditions: {
        orgType?: string;
        status?: number;
        parentOrgCode?: string;
        ancestorOrgCode?: string;
      };
    };
  },
  tx: DbClient = db,
) {
  const { fuzzyConditions, exactConditions } = query.conditions;
  const parent = alias(organizations, "admin_parent");
  const ancestor = alias(organizations, "admin_ancestor");

  const rows = await tx.select().from(organizations).where(and(
    eq(organizations.isDelete, false),
    exactConditions.orgType ? eq(organizations.orgType, exactConditions.orgType) : undefined,
    exactConditions.status !== undefined ? eq(organizations.status, exactConditions.status) : undefined,
    exactConditions.parentOrgCode
      ? exists(
          db.select({ value: sql`1` }).from(parent).where(and(
            eq(parent.id, organizations.parentId),
            eq(parent.orgCode, exactConditions.parentOrgCode),
          )),
        )
      : undefined,
    exactConditions.ancestorOrgCode
      ? exists(
          db.select({ value: sql`1` })
            .from(organizationClosures)
            .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
            .where(and(
              eq(organizationClosures.descendantId, organizations.id),
              gt(organizationClosures.depth, 0),
              eq(ancestor.orgCode, exactConditions.ancestorOrgCode),
            )),
        )
      : undefined,
    fuzzyConditions.text
      ? or(
          ilikeContainsIf(organizations.orgCode, fuzzyConditions.text),
          ilikeContainsIf(organizations.orgName, fuzzyConditions.text),
        )
      : undefined,
  )).orderBy(organizations.level, organizations.orderNum, organizations.id);

  return await attachOrganizationRelations(rows, tx, { activeChildrenOnly: true });
}

export async function updateOrganizationByCode(
  orgCode: string,
  data: { orgCode?: string; orgName?: string; orgType?: string; status?: number },
  tx: DbClient = db,
) {
  return await tx
    .update(organizations)
    .set(compactUpdate(data))
    .where(and(eq(organizations.orgCode, orgCode), eq(organizations.isDelete, false)));
}

export async function softDeleteOrganizationByCode(orgCode: string, tx: DbClient = db) {
  return await tx
    .update(organizations)
    .set({ isDelete: true })
    .where(and(eq(organizations.orgCode, orgCode), eq(organizations.isDelete, false)));
}

export async function countActiveChildrenByOrgCode(orgCode: string, tx: DbClient = db) {
  const parent = alias(organizations, "child_count_parent");
  const rows = await tx
    .select({ value: count() })
    .from(organizations)
    .innerJoin(parent, eq(organizations.parentId, parent.id))
    .where(and(
      eq(organizations.isDelete, false),
      eq(parent.orgCode, orgCode),
      eq(parent.isDelete, false),
    ));
  return firstRow(rows)?.value ?? 0;
}

export async function countActiveEmploymentsByOrgCode(orgCode: string, tx: DbClient = db) {
  const dept = alias(organizations, "employment_dept_count");
  const company = alias(organizations, "employment_company_count");
  const rows = await tx
    .select({ value: count() })
    .from(employments)
    .leftJoin(dept, eq(employments.orgId, dept.id))
    .leftJoin(company, eq(employments.compId, company.id))
    .where(and(
      eq(employments.isDelete, false),
      or(
        and(eq(dept.orgCode, orgCode), eq(dept.isDelete, false)),
        and(eq(company.orgCode, orgCode), eq(company.isDelete, false)),
      ),
    ));
  return firstRow(rows)?.value ?? 0;
}
