import type { OrganizationCreateDto, OrganizationQueryDto } from "@api/services/organization/organization.type";
import type { DbClient } from "@iam/db";
import type { Organization } from "@iam/db/schema";
import { OrganizationStatus } from "@iam/contracts";
import db from "@iam/db";
import { compactUpdate, firstRow, inArrayIf } from "@iam/db/query-utils";
import { organizationClosures, organizations } from "@iam/db/schema";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
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
    eq(organizations.status, OrganizationStatus.Enable),
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
    eq(organizations.status, OrganizationStatus.Enable),
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
      eq(organizations.status, OrganizationStatus.Enable),
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

export async function getOrganizationByCodeForAdmin(orgCode: string, tx: DbClient = db) {
  const rows = await tx.select().from(organizations).where(and(
    eq(organizations.orgCode, orgCode),
    eq(organizations.isDelete, false),
  )).limit(1);
  return firstRow(await attachOrganizationRelations(rows, tx, { activeChildrenOnly: true })) ?? null;
}

export async function updateOrganizationByCode(
  orgCode: string,
  data: { orgCode?: string; orgName?: string; orgType?: string; status?: OrganizationStatus },
  tx: DbClient = db,
) {
  return await tx
    .update(organizations)
    .set(compactUpdate(data))
    .where(and(eq(organizations.orgCode, orgCode), eq(organizations.isDelete, false)));
}
