import type { DbClient } from "@iam/db";
import type { Employment, Organization, User } from "@iam/db/schema";
import { EmploymentStatus, OrganizationType } from "@iam/contracts";
import { firstRow } from "@iam/db/query-utils";
import {
  employments,
  organizationClosures,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export function createEmploymentRepository(db: DbClient) {
  return {
    async getEmploymentsByUserId(userId: number) {
      const rows = await db.query.employments.findMany({
        where: {
          userId,
          status: EmploymentStatus.Enable,
          isDelete: false,
        },
      });
      return await attachEmploymentRelations(rows, db);
    },
    async getEmploymentByUserOrgPosId(userId: number, orgId: number, posId: number) {
      const row = await db.query.employments.findFirst({
        where: {
          userId,
          orgId,
          posId,
          status: EmploymentStatus.Enable,
          isDelete: false,
        },
      });
      return (await attachEmploymentRelations(row === undefined ? [] : [row], db))[0] ?? null;
    },
    async setEmployment(userId: number, posId: number, orgId: number) {
      return firstRow(await db.insert(employments).values({
        userId,
        posId,
        orgId,
      }).returning())!;
    },
  };
}

export type EmploymentRepository = ReturnType<typeof createEmploymentRepository>;

type Position = typeof positions.$inferSelect;
type EmploymentOrgNode = Pick<
  Organization,
  "id" | "orgCode" | "orgName" | "orgType" | "level" | "parentId" | "isVirtual" | "isEntity"
> & {
  pathIndex: number;
  distanceToAssignedOrg: number;
};

type EmploymentWithRelations = Employment & {
  user: User;
  organization: {
    assignedOrg: EmploymentOrgNode;
    fullOrgPath: EmploymentOrgNode[];
    companyNodes: EmploymentOrgNode[];
  };
  position: Position;
};

async function attachEmploymentRelations(rows: Employment[], tx: DbClient): Promise<EmploymentWithRelations[]> {
  if (rows.length === 0) {
    return [];
  }

  const userIds = [...new Set(rows.map(row => row.userId))];
  const orgIds = [...new Set(rows.map(row => row.orgId))];
  const posIds = [...new Set(rows.map(row => row.posId))];
  const ancestor = alias(organizations, "public_employment_org_ancestor");

  const [userRows, orgPathRows, posRows] = await Promise.all([
    tx.select().from(users).where(inArray(users.id, userIds)),
    tx
      .select({
        descendantId: organizationClosures.descendantId,
        depth: organizationClosures.depth,
        id: ancestor.id,
        orgCode: ancestor.orgCode,
        orgName: ancestor.orgName,
        orgType: ancestor.orgType,
        level: ancestor.level,
        parentId: ancestor.parentId,
        isVirtual: ancestor.isVirtual,
        isEntity: ancestor.isEntity,
      })
      .from(organizationClosures)
      .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
      .where(and(
        inArray(organizationClosures.descendantId, orgIds),
        eq(ancestor.isDelete, false),
      )),
    tx.select().from(positions).where(inArray(positions.id, posIds)),
  ]);

  const userMap = new Map(userRows.map(user => [user.id, user]));
  const posMap = new Map(posRows.map(pos => [pos.id, pos]));
  const orgPathMap = new Map<number, EmploymentOrgNode[]>();
  for (const { descendantId, depth, ...org } of orgPathRows) {
    const path = orgPathMap.get(descendantId) ?? [];
    path.push({
      ...org,
      pathIndex: 0,
      distanceToAssignedOrg: depth,
    });
    orgPathMap.set(descendantId, path);
  }
  for (const [orgId, path] of orgPathMap) {
    orgPathMap.set(
      orgId,
      path
        .sort((a, b) => b.distanceToAssignedOrg - a.distanceToAssignedOrg || a.id - b.id)
        .map((node, pathIndex) => ({ ...node, pathIndex })),
    );
  }

  return rows
    .map((row) => {
      const fullOrgPath = orgPathMap.get(row.orgId) ?? [];
      const assignedOrg = fullOrgPath.find(node => node.id === row.orgId);
      return {
        ...row,
        user: userMap.get(row.userId),
        organization: assignedOrg === undefined
          ? undefined
          : {
              assignedOrg,
              fullOrgPath,
              companyNodes: fullOrgPath.filter(node => node.orgType === OrganizationType.Company),
            },
        position: posMap.get(row.posId),
      };
    })
    .filter((row): row is EmploymentWithRelations =>
      row.user !== undefined
      && row.organization !== undefined
      && row.position !== undefined,
    );
}
