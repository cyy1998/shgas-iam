import type { DbClient } from "@api/db";
import type { Organization, User } from "@api/db/schema";
import type { Prettify } from "@api/utils/lint.util";
import type { PrivilegeDelegationCreateDto, PrivilegeDelegationQueryDto } from "./privilegeDelegation.type";
import db from "@api/db";
import { compactUpdate, firstRow, inArrayIf } from "@api/db/query-utils";
import {
  delegationDetails,
  organizationClosures,
  organizations,
  privilegeDelegations,
  privileges,
  users,
} from "@api/db/schema";
import { Status } from "@api/enums/status";
import { CustomError } from "@api/errors/CustomError";
import { and, eq, exists, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type Privilege = typeof privileges.$inferSelect;
type Delegation = typeof privilegeDelegations.$inferSelect;
type DelegationDetail = typeof delegationDetails.$inferSelect & { privilege: Privilege };
type OrganizationWithRelations = Organization & { parent: Organization | null; children: Organization[] };
type DelegationWithRelations = Delegation & {
  delegateeUser: User;
  delegatorUser: User;
  organizationScope: OrganizationWithRelations;
  delegationDetails: DelegationDetail[];
};

async function attachOrganizationRelations(rows: Organization[], tx: DbClient): Promise<OrganizationWithRelations[]> {
  if (rows.length === 0) {
    return [];
  }
  const parentIds = [...new Set(rows.map(row => row.parentId).filter(id => id > 0))];
  const [parents, children] = await Promise.all([
    parentIds.length === 0
      ? Promise.resolve([])
      : tx.select().from(organizations).where(inArray(organizations.id, parentIds)),
    tx.select().from(organizations).where(inArray(organizations.parentId, rows.map(row => row.id))),
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

async function attachDelegationRelations(rows: Delegation[], tx: DbClient): Promise<DelegationWithRelations[]> {
  if (rows.length === 0) {
    return [];
  }
  const userIds = [...new Set(rows.flatMap(row => [row.delegatorUserId, row.delegateeUserId]))];
  const orgIds = [...new Set(rows.map(row => row.organizationScopeId))];
  const delegationIds = rows.map(row => row.id);
  const [userRows, orgRows, detailRows] = await Promise.all([
    tx.select().from(users).where(inArray(users.id, userIds)),
    tx.select().from(organizations).where(inArray(organizations.id, orgIds)),
    tx
      .select({
        delegationId: delegationDetails.delegationId,
        privilegeId: delegationDetails.privilegeId,
        privilege: privileges,
      })
      .from(delegationDetails)
      .innerJoin(privileges, eq(delegationDetails.privilegeId, privileges.id))
      .where(inArray(delegationDetails.delegationId, delegationIds)),
  ]);

  const userMap = new Map(userRows.map(user => [user.id, user]));
  const orgMap = new Map((await attachOrganizationRelations(orgRows, tx)).map(org => [org.id, org]));
  const detailsMap = new Map<number, DelegationDetail[]>();
  for (const detail of detailRows) {
    const details = detailsMap.get(detail.delegationId) ?? [];
    details.push(detail);
    detailsMap.set(detail.delegationId, details);
  }

  return rows
    .map(row => ({
      ...row,
      delegatorUser: userMap.get(row.delegatorUserId),
      delegateeUser: userMap.get(row.delegateeUserId),
      organizationScope: orgMap.get(row.organizationScopeId),
      delegationDetails: detailsMap.get(row.id) ?? [],
    }))
    .filter((row): row is DelegationWithRelations =>
      row.delegatorUser !== undefined && row.delegateeUser !== undefined && row.organizationScope !== undefined,
    );
}

function organizationScopeContainsOrg(orgCodes: string[] | undefined) {
  if (orgCodes === undefined) {
    return undefined;
  }
  const descendant = alias(organizations, "delegation_scope_descendant");
  return exists(
    db.select({ value: sql`1` })
      .from(organizationClosures)
      .innerJoin(descendant, eq(organizationClosures.descendantId, descendant.id))
      .where(and(
        eq(organizationClosures.ancestorId, privilegeDelegations.organizationScopeId),
        inArrayIf(descendant.orgCode, orgCodes),
      )),
  );
}

function delegationHasPrivileges(privCodes: string[] | undefined) {
  if (privCodes === undefined) {
    return undefined;
  }
  return exists(
    db.select({ value: sql`1` })
      .from(delegationDetails)
      .innerJoin(privileges, eq(delegationDetails.privilegeId, privileges.id))
      .where(and(
        eq(delegationDetails.delegationId, privilegeDelegations.id),
        inArrayIf(privileges.privilegeCode, privCodes),
      )),
  );
}

export async function getDelegationsByUserAndOrganizationScopeAndPrivilege(
  usernames: string[],
  orgCode: string,
  privCode: string,
  tx: DbClient = db,
) {
  const now = new Date();
  const rows = await tx.select().from(privilegeDelegations).where(and(
    delegationHasPrivileges([privCode]),
    organizationScopeContainsOrg([orgCode]),
    exists(
      db.select({ value: sql`1` }).from(users).where(and(
        eq(users.id, privilegeDelegations.delegatorUserId),
        inArrayIf(users.username, usernames),
      )),
    ),
    eq(privilegeDelegations.status, Status.Enable),
    lte(privilegeDelegations.startTime, now),
    gte(privilegeDelegations.endTime, now),
  ));
  return await attachDelegationRelations(rows, tx);
}

export async function searchDelegations(
  query: Prettify<PrivilegeDelegationQueryDto>,
  tx: DbClient = db,
) {
  const rows = await tx.select().from(privilegeDelegations).where(and(
    query.delegateeUsernames === undefined
      ? undefined
      : exists(db.select({ value: sql`1` }).from(users).where(and(
          eq(users.id, privilegeDelegations.delegateeUserId),
          inArrayIf(users.username, query.delegateeUsernames),
        ))),
    query.delegatorUsernames === undefined
      ? undefined
      : exists(db.select({ value: sql`1` }).from(users).where(and(
          eq(users.id, privilegeDelegations.delegatorUserId),
          inArrayIf(users.username, query.delegatorUsernames),
        ))),
    organizationScopeContainsOrg(query.orgCodes),
    query.validTime === undefined ? undefined : lte(privilegeDelegations.startTime, new Date(query.validTime)),
    query.validTime === undefined ? undefined : gte(privilegeDelegations.endTime, new Date(query.validTime)),
    delegationHasPrivileges(query.privCodes),
    eq(privilegeDelegations.isDelete, false),
  ));
  return await attachDelegationRelations(rows, tx);
}

export async function getActiveDelegationsByDelegatorAndPrivileges(
  delegatorUserId: number,
  privilegeIds: number[],
  startTime: Date,
  endTime: Date,
  tx: DbClient = db,
) {
  if (privilegeIds.length === 0) {
    return [];
  }
  const rows = await tx.select().from(privilegeDelegations).where(and(
    eq(privilegeDelegations.delegatorUserId, delegatorUserId),
    eq(privilegeDelegations.isDelete, false),
    ne(privilegeDelegations.status, Status.Disable),
    sql`not (${privilegeDelegations.endTime} < ${startTime} or ${privilegeDelegations.startTime} > ${endTime})`,
    exists(
      db.select({ value: sql`1` }).from(delegationDetails).where(and(
        eq(delegationDetails.delegationId, privilegeDelegations.id),
        inArray(delegationDetails.privilegeId, privilegeIds),
      )),
    ),
  ));
  return await attachDelegationRelations(rows, tx);
}

export async function updateDelegation(
  id: number,
  data: { startTime?: Date; endTime?: Date; status?: Status; description?: string | null },
  tx: DbClient = db,
) {
  return firstRow(await tx
    .update(privilegeDelegations)
    .set(compactUpdate(data))
    .where(eq(privilegeDelegations.id, id))
    .returning())!;
}

export async function setPrivilegeDelegation(
  dto: Prettify<PrivilegeDelegationCreateDto>,
  tx: DbClient = db,
) {
  if (!dto.delegateeUserId || !dto.delegatorUserId || !dto.organizationScopeId || !dto.privilegeIds) {
    throw new CustomError("缺少必要参数");
  }
  const delegation = firstRow(await tx.insert(privilegeDelegations).values({
    delegatorUserId: dto.delegatorUserId,
    delegateeUserId: dto.delegateeUserId,
    organizationScopeId: dto.organizationScopeId,
    startTime: dto.startTime,
    endTime: dto.endTime,
    status: Status.Enable,
    description: dto.description,
  }).returning())!;

  if (dto.privilegeIds.length > 0) {
    await tx.insert(delegationDetails).values(dto.privilegeIds.map(privilegeId => ({
      delegationId: delegation.id,
      privilegeId,
    })));
  }

  return firstRow(await attachDelegationRelations([delegation], tx))!;
}
