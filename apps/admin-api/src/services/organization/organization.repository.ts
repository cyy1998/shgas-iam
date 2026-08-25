import type { AdminOrganizationReadScope } from "@admin-api/services/organization/organization.port";
import type {
  OrganizationCreateDto,
  OrganizationPaginationQueryDto,
  OrganizationPathNode,
  OrganizationSelectorNode,
  OrganizationSelectorQueryDto,
  OrganizationUpdateDto,
} from "@admin-api/services/organization/organization.type";
import type { DbClient } from "@iam/db";
import type { Organization } from "@iam/db/schema";
import { getChildOrganizationLevel, OrganizationStatus } from "@iam/contracts";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import { employments, organizationClosures, organizations } from "@iam/db/schema";
import { OPEN_EMPLOYMENT_STATUSES } from "@iam/domain/employment";
import { and, count, eq, exists, gt, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export function createOrganizationRepository(db: DbClient) {
  return {
    async getOrganizationByCode(orgCode: string) {
      const rows = await db.select().from(organizations).where(and(
        eq(organizations.orgCode, orgCode),
        eq(organizations.status, OrganizationStatus.Enable),
        eq(organizations.isDelete, false),
      )).limit(1);
      return firstRow(await attachOrganizationRelations(rows, db)) ?? null;
    },
    async setOrganization(organizationCreateDto: OrganizationCreateDto, parentOrganization: Organization | null) {
      const { parentCode, ...org } = organizationCreateDto;
      const newOrganization = firstRow(await db.insert(organizations).values(org).returning())!;
      const path = `${parentOrganization ? parentOrganization.path : ""}/${newOrganization.id}`;
      const level = getChildOrganizationLevel(parentOrganization?.level ?? null);
      const updatedOrganization = firstRow(await db
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
        : await db
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

      await db.insert(organizationClosures).values(closureRelations).onConflictDoNothing();
      return firstRow(await attachOrganizationRelations([updatedOrganization], db))!;
    },
    async listOrgChildrenByParentCode(
      parentOrgCode: string | null,
      pageNum: number,
      pageSize: number,
      scope?: AdminOrganizationReadScope,
    ) {
      let parentId: number;
      if (parentOrgCode === null) {
        parentId = -1;
      }
      else {
        const parent = firstRow(await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(and(
            eq(organizations.orgCode, parentOrgCode),
            eq(organizations.isDelete, false),
            scope ? inArray(organizations.id, scope.organizationIds) : undefined,
          ))
          .limit(1));
        if (parent == null) {
          return { rows: [], total: 0 };
        }
        parentId = parent.id;
      }

      const where = and(
        eq(organizations.isDelete, false),
        eq(organizations.parentId, parentId),
        scope
          ? inArray(
              organizations.id,
              parentOrgCode === null
                ? scope.rootOrganizationIds
                : scope.organizationIds,
            )
          : undefined,
      );
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(organizations)
          .where(where)
          .orderBy(organizations.orderNum, organizations.id)
          .limit(pageSize)
          .offset((pageNum - 1) * pageSize),
        db.select({ value: count() }).from(organizations).where(where),
      ]);
      const total = firstRow(totalRows)?.value ?? 0;

      if (rows.length === 0) {
        return { rows: [], total };
      }

      const grandchildCounts = await db
        .select({ parentId: organizations.parentId, value: count() })
        .from(organizations)
        .where(and(
          eq(organizations.isDelete, false),
          inArray(organizations.parentId, rows.map(r => r.id)),
          scope ? inArray(organizations.id, scope.organizationIds) : undefined,
        ))
        .groupBy(organizations.parentId);
      const countMap = new Map(grandchildCounts.map(c => [c.parentId, c.value]));

      return {
        rows: rows.map(r => ({
          ...r,
          childCount: countMap.get(r.id) ?? 0,
        })),
        total,
      };
    },
    async getOrganizationByCodeForAdmin(
      orgCode: string,
      scope?: AdminOrganizationReadScope,
    ) {
      const rows = await db.select().from(organizations).where(and(
        eq(organizations.orgCode, orgCode),
        eq(organizations.isDelete, false),
        scope ? inArray(organizations.id, scope.organizationIds) : undefined,
      )).limit(1);
      return firstRow(await attachOrganizationRelations(rows, db, {
        activeChildrenOnly: true,
        organizationIds: scope?.organizationIds,
      })) ?? null;
    },
    async searchOrganizationsForAdmin(
      query: OrganizationPaginationQueryDto,
      scope?: AdminOrganizationReadScope,
    ) {
      const { fuzzyConditions, exactConditions } = query.conditions;
      const parent = alias(organizations, "admin_parent");
      const ancestor = alias(organizations, "admin_ancestor");

      const rows = await db.select().from(organizations).where(and(
        eq(organizations.isDelete, false),
        scope ? inArray(organizations.id, scope.organizationIds) : undefined,
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

      return await attachOrganizationRelations(rows, db, {
        activeChildrenOnly: true,
        organizationIds: scope?.organizationIds,
      });
    },
    async getOrganizationSelectorNodesForAdmin(
      query: OrganizationSelectorQueryDto,
      scope?: AdminOrganizationReadScope,
    ) {
      let parentId: number | undefined;
      const visibleStatusCondition = inArrayIf(organizations.status, query.visibleStatuses);

      if (query.parentOrgCode !== undefined && query.parentOrgCode !== null) {
        const parent = firstRow(await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(and(
            eq(organizations.orgCode, query.parentOrgCode),
            eq(organizations.isDelete, false),
            scope ? inArray(organizations.id, scope.organizationIds) : undefined,
          ))
          .limit(1));
        if (parent == null) {
          return [];
        }
        parentId = parent.id;
      }

      const rows = await db
        .select()
        .from(organizations)
        .where(and(
          eq(organizations.isDelete, false),
          scope ? inArray(organizations.id, scope.organizationIds) : undefined,
          parentId !== undefined
            ? eq(organizations.parentId, parentId)
            : query.text === undefined && query.orgCode === undefined
              ? scope
                ? inArray(organizations.id, scope.rootOrganizationIds)
                : eq(organizations.parentId, -1)
              : undefined,
          query.orgCode === undefined ? undefined : eq(organizations.orgCode, query.orgCode),
          visibleStatusCondition,
          query.text === undefined
            ? undefined
            : or(
                ilikeContainsIf(organizations.orgCode, query.text),
                ilikeContainsIf(organizations.orgName, query.text),
              ),
        ))
        .orderBy(organizations.level, organizations.orderNum, organizations.id)
        .limit(query.pageSize);

      return await attachSelectorNodeContext(rows, query, db, scope);
    },
    async isOrganizationDescendantOf(descendantOrgCode: string, ancestorOrgCode: string) {
      const descendant = alias(organizations, "ancestor_check_descendant");
      const ancestor = alias(organizations, "ancestor_check_ancestor");
      const rows = await db
        .select({ value: sql`1` })
        .from(organizationClosures)
        .innerJoin(descendant, eq(organizationClosures.descendantId, descendant.id))
        .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
        .where(and(
          eq(descendant.orgCode, descendantOrgCode),
          eq(descendant.isDelete, false),
          eq(ancestor.orgCode, ancestorOrgCode),
          eq(ancestor.isDelete, false),
        ))
        .limit(1);
      return rows.length > 0;
    },
    async updateOrganizationByCode(orgCode: string, data: OrganizationUpdateDto) {
      return await db
        .update(organizations)
        .set(compactUpdate(data))
        .where(and(eq(organizations.orgCode, orgCode), eq(organizations.isDelete, false)));
    },
    async softDeleteOrganizationByCode(orgCode: string) {
      return await db
        .update(organizations)
        .set({ isDelete: true })
        .where(and(eq(organizations.orgCode, orgCode), eq(organizations.isDelete, false)));
    },
    async countActiveChildrenByOrgCode(orgCode: string) {
      const parent = alias(organizations, "child_count_parent");
      const rows = await db
        .select({ value: count() })
        .from(organizations)
        .innerJoin(parent, eq(organizations.parentId, parent.id))
        .where(and(
          eq(organizations.isDelete, false),
          eq(parent.orgCode, orgCode),
          eq(parent.isDelete, false),
        ));
      return firstRow(rows)?.value ?? 0;
    },
    async countOpenEmploymentsByOrgCode(orgCode: string) {
      const ancestor = alias(organizations, "employment_org_count_ancestor");
      const rows = await db
        .select({ value: count() })
        .from(employments)
        .where(and(
          eq(employments.isDelete, false),
          inArray(employments.status, OPEN_EMPLOYMENT_STATUSES),
          exists(
            db.select({ value: sql`1` })
              .from(organizationClosures)
              .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
              .where(and(
                eq(organizationClosures.descendantId, employments.orgId),
                eq(ancestor.orgCode, orgCode),
                eq(ancestor.isDelete, false),
              )),
          ),
        ));
      return firstRow(rows)?.value ?? 0;
    },
  };
}

export type OrganizationRepository = ReturnType<typeof createOrganizationRepository>;

type OrganizationWithRelations = Organization & {
  parent: Organization | null;
  children: Organization[];
};

async function attachOrganizationRelations(
  rows: Organization[],
  tx: DbClient,
  options: {
    activeChildrenOnly?: boolean;
    organizationIds?: readonly number[];
  } = {},
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
      options.organizationIds
        ? inArray(organizations.id, options.organizationIds)
        : undefined,
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

function toPathText(fullPath: OrganizationPathNode[]) {
  return fullPath.map(node => node.orgName).join(" / ");
}

function isSelectable(
  row: Organization,
  query: Pick<OrganizationSelectorQueryDto, "selectableOrgTypes" | "selectableStatuses">,
) {
  return (
    query.selectableOrgTypes === undefined || query.selectableOrgTypes.includes(row.orgType)
  ) && (
    query.selectableStatuses === undefined || query.selectableStatuses.includes(row.status)
  );
}

async function attachSelectorNodeContext(
  rows: Organization[],
  query: Pick<OrganizationSelectorQueryDto, "selectableOrgTypes" | "selectableStatuses" | "visibleStatuses">,
  tx: DbClient,
  scope?: AdminOrganizationReadScope,
): Promise<OrganizationSelectorNode[]> {
  if (rows.length === 0) {
    return [];
  }

  const rowIds = rows.map(row => row.id);
  const ancestor = alias(organizations, "selector_path_ancestor");
  const visibleChildStatusCondition = inArrayIf(organizations.status, query.visibleStatuses);
  const [childrenCounts, pathRows] = await Promise.all([
    tx
      .select({ parentId: organizations.parentId, value: count() })
      .from(organizations)
      .where(and(
        eq(organizations.isDelete, false),
        inArray(organizations.parentId, rowIds),
        scope ? inArray(organizations.id, scope.organizationIds) : undefined,
        visibleChildStatusCondition,
      ))
      .groupBy(organizations.parentId),
    tx
      .select({
        descendantId: organizationClosures.descendantId,
        depth: organizationClosures.depth,
        id: ancestor.id,
        orgCode: ancestor.orgCode,
        orgName: ancestor.orgName,
        orgType: ancestor.orgType,
        status: ancestor.status,
        level: ancestor.level,
        parentId: ancestor.parentId,
      })
      .from(organizationClosures)
      .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
      .where(and(
        inArray(organizationClosures.descendantId, rowIds),
        eq(ancestor.isDelete, false),
      )),
  ]);

  const childrenCountMap = new Map(childrenCounts.map(row => [row.parentId, row.value]));
  const pathMap = new Map<number, OrganizationPathNode[]>();
  for (const { descendantId, depth: _depth, ...node } of pathRows) {
    const path = pathMap.get(descendantId) ?? [];
    path.push({ ...node, pathIndex: 0 });
    pathMap.set(descendantId, path);
  }
  for (const row of rows) {
    const path = (pathMap.get(row.id) ?? [])
      .sort((a, b) => a.level - b.level || a.id - b.id)
      .map((node, pathIndex) => ({ ...node, pathIndex }));
    pathMap.set(row.id, path);
  }

  return rows.map(row => ({
    id: row.id,
    orgCode: row.orgCode,
    orgName: row.orgName,
    orgType: row.orgType,
    status: row.status,
    level: row.level,
    parentId: row.parentId,
    isLeaf: (childrenCountMap.get(row.id) ?? 0) === 0,
    fullPath: pathMap.get(row.id) ?? [],
    pathText: toPathText(pathMap.get(row.id) ?? []),
    selectable: isSelectable(row, query),
  }));
}
