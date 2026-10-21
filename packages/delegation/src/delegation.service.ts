import { ApiErrorCode, ClientDelegationStatus, ClientStatus, OrganizationStatus, UserStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { compactUpdate, firstRow } from "@iam/db/query-utils";
import { clients, clientDelegations as delegations, organizationClosures, organizations, users } from "@iam/db/schema";
import { DomainBusinessError, DomainHttpStatus } from "@iam/domain";
import {
  ClientDelegationConflictError,
  ClientDelegationEndedError,
  ClientDelegationNotFoundError,
  validateClientDelegationCandidate,
} from "@iam/domain/client-delegation";
import { UserNotFoundError } from "@iam/domain/user";
import { and, desc, eq, exists, getTableColumns, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  DelegationCommandContext,
  DelegationReadScope,
  DelegationSelectorQuery,
  DelegationServiceDependencies,
  DelegationWriteScope,
} from "./delegation.port";
import type { DelegationCreateInput, DelegationSearchInput, DelegationUpdateInput } from "./wire";
import { DelegationCreateSchema, DelegationDetailSchema, DelegationSearchSchema, DelegationUpdateSchema } from "./wire";

function invalid(message: string): never {
  throw new DomainBusinessError(message, { code: ApiErrorCode.BadRequest, httpStatus: DomainHttpStatus.BadRequest });
}
function scopePredicate(scope: DelegationReadScope) {
  switch (scope.kind) {
    case "all":
      return undefined;
    case "client":
      return eq(delegations.clientId, scope.clientId);
    case "delegator":
      return eq(delegations.delegatorUserId, scope.userId);
    case "delegatee":
      return eq(delegations.delegateeUserId, scope.userId);
    default:
      return invalid("委托访问范围无效");
  }
}
const delegator = alias(users, "delegation_delegator");
const delegatee = alias(users, "delegation_delegatee");

async function details(db: DbClient, where: ReturnType<typeof and>) {
  const rows = await db
    .select({
      ...getTableColumns(delegations),
      delegatorUser: {
        id: delegator.id,
        username: delegator.username,
        name: delegator.name,
        isDelete: delegator.isDelete,
      },
      delegateeUser: {
        id: delegatee.id,
        username: delegatee.username,
        name: delegatee.name,
        isDelete: delegatee.isDelete,
      },
      client: {
        id: clients.id,
        clientCode: clients.clientCode,
        clientName: clients.clientName,
        isDelete: clients.isDelete,
      },
      organizationScope: {
        id: organizations.id,
        orgCode: organizations.orgCode,
        orgName: organizations.orgName,
        isDelete: organizations.isDelete,
      },
    })
    .from(delegations)
    .innerJoin(delegator, eq(delegator.id, delegations.delegatorUserId))
    .innerJoin(delegatee, eq(delegatee.id, delegations.delegateeUserId))
    .innerJoin(clients, eq(clients.id, delegations.clientId))
    .innerJoin(organizations, eq(organizations.id, delegations.organizationScopeId))
    .where(where)
    .orderBy(desc(delegations.id));
  return rows.map((row) =>
    DelegationDetailSchema.parse({
      ...row,
      delegatorUsername: row.delegatorUser.username,
      delegatorName: row.delegatorUser.name,
      delegateeUsername: row.delegateeUser.username,
      delegateeName: row.delegateeUser.name,
    }),
  );
}
async function assertNoConflict(db: DbClient, candidate: typeof delegations.$inferInsert, excludeId?: number) {
  if (candidate.status === ClientDelegationStatus.Disable) return;
  const conflict = await db
    .select({ id: delegations.id })
    .from(delegations)
    .where(
      and(
        eq(delegations.delegatorUserId, candidate.delegatorUserId),
        eq(delegations.clientId, candidate.clientId),
        ne(delegations.status, ClientDelegationStatus.Disable),
        gte(delegations.endTime, candidate.startTime),
        lte(delegations.startTime, candidate.endTime),
        excludeId === undefined ? undefined : ne(delegations.id, excludeId),
        or(
          eq(delegations.organizationScopeId, candidate.organizationScopeId),
          exists(
            db
              .select({ value: sql`1` })
              .from(organizationClosures)
              .where(
                or(
                  and(
                    eq(organizationClosures.ancestorId, candidate.organizationScopeId),
                    eq(organizationClosures.descendantId, delegations.organizationScopeId),
                  ),
                  and(
                    eq(organizationClosures.descendantId, candidate.organizationScopeId),
                    eq(organizationClosures.ancestorId, delegations.organizationScopeId),
                  ),
                ),
              ),
          ),
        ),
      ),
    )
    .limit(1);
  if (conflict.length) throw new ClientDelegationConflictError("同一应用在相交的组织范围和期间内已有委托");
}

export function createDelegationService(deps: DelegationServiceDependencies) {
  const audit = async (
    tx: Parameters<DelegationServiceDependencies["recordAudit"]>[0],
    operation: "create" | "update",
    id: number,
    context: DelegationCommandContext,
    eventDetails: Record<string, unknown>,
  ) => {
    await deps.recordAudit(tx, {
      ...context.requestContext,
      ...context.actor,
      action: `${context.actionPrefix}.delegation.${operation}`,
      outcome: "success",
      targetType: "delegation",
      targetId: id,
      details: eventDetails,
    });
  };
  async function create(input: DelegationCreateInput, scope: DelegationWriteScope, context: DelegationCommandContext) {
    const dto = DelegationCreateSchema.parse(input);
    if (scope.kind !== "all" && scope.kind !== "client" && scope.kind !== "delegator") invalid("此范围不允许管理委托");
    return deps.db.transaction(async (tx) => {
      const ownerFilter =
        scope.kind === "delegator"
          ? eq(users.id, scope.userId)
          : dto.delegatorUsername
            ? eq(users.username, dto.delegatorUsername)
            : invalid("必须指定委托人");
      const owner = firstRow(
        await tx
          .select()
          .from(users)
          .where(and(ownerFilter, eq(users.isDelete, false)))
          .for("update"),
      );
      if (!owner || owner.status !== UserStatus.Enable) invalid("委托人不存在或未启用");
      if (scope.kind === "delegator" && dto.delegatorUsername !== undefined && dto.delegatorUsername !== owner.username)
        invalid("不能为其他用户创建委托");
      const receiver = firstRow(
        await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.username, dto.delegateeUsername),
              eq(users.isDelete, false),
              eq(users.status, UserStatus.Enable),
            ),
          ),
      );
      if (!receiver) invalid("受托人不存在或未启用");
      const clientId = scope.kind === "client" ? scope.clientId : dto.clientId;
      if (clientId === undefined) invalid("必须指定应用");
      if (scope.kind === "client" && dto.clientId !== undefined && dto.clientId !== scope.clientId)
        invalid("不能管理其他应用的委托");
      const client = firstRow(
        await tx
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.id, clientId), eq(clients.isDelete, false), eq(clients.status, ClientStatus.Enable))),
      );
      if (!client) invalid("应用不存在或未启用");
      const organization = firstRow(
        await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(
            and(
              eq(organizations.orgCode, dto.orgCode),
              eq(organizations.isDelete, false),
              eq(organizations.status, OrganizationStatus.Enable),
            ),
          ),
      );
      if (!organization) invalid("组织不存在或未启用");
      const candidate = {
        delegatorUserId: owner.id,
        delegateeUserId: receiver.id,
        clientId,
        organizationScopeId: organization.id,
        startTime: dto.startTime,
        endTime: dto.endTime,
        status: ClientDelegationStatus.Enable,
        description: dto.description ?? null,
      };
      validateClientDelegationCandidate(candidate);
      await assertNoConflict(tx, candidate);
      const row = firstRow(await tx.insert(delegations).values(candidate).returning({ id: delegations.id }))!;
      const result = (await details(tx, eq(delegations.id, row.id)))[0]!;
      await audit(tx, "create", row.id, context, {
        changed: true,
        clientId,
        delegatorUsername: owner.username,
        delegateeUsername: dto.delegateeUsername,
        orgCode: dto.orgCode,
        startTime: dto.startTime,
        endTime: dto.endTime,
      });
      return { changed: true, result };
    });
  }
  async function update(
    id: number,
    input: DelegationUpdateInput,
    scope: DelegationWriteScope,
    context: DelegationCommandContext,
  ) {
    const dto = DelegationUpdateSchema.parse(input);
    if (scope.kind !== "all" && scope.kind !== "client" && scope.kind !== "delegator") invalid("此范围不允许管理委托");
    const withinScope = and(eq(delegations.id, id), scopePredicate(scope));
    return deps.db.transaction(async (tx) => {
      const locator = firstRow(
        await tx.select({ userId: delegations.delegatorUserId }).from(delegations).where(withinScope),
      );
      if (!locator) throw new ClientDelegationNotFoundError();
      const owner = firstRow(
        await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, locator.userId), eq(users.isDelete, false)))
          .for("update"),
      );
      if (!owner) throw new UserNotFoundError("委托人不存在");
      const current = firstRow(await tx.select().from(delegations).where(withinScope).for("update"));
      if (!current) throw new ClientDelegationNotFoundError();
      if (current.delegatorUserId !== owner.id) throw new Error("Delegation lock owner changed");
      const fields = Object.keys(dto).filter((key) => dto[key as keyof typeof dto] !== undefined);
      if (current.status === ClientDelegationStatus.Disable) {
        if (fields.length !== 1 || dto.status !== ClientDelegationStatus.Disable)
          throw new ClientDelegationEndedError();
        const result = (await details(tx, withinScope))[0]!;
        await audit(tx, "update", id, context, { patch: dto, changed: false });
        return { changed: false, result };
      }
      if (!fields.length) invalid("更新参数不能为空");
      const candidate = { ...current, ...compactUpdate(dto) };
      validateClientDelegationCandidate(candidate);
      await assertNoConflict(tx, candidate, id);
      const changed =
        candidate.startTime.getTime() !== current.startTime.getTime() ||
        candidate.endTime.getTime() !== current.endTime.getTime() ||
        candidate.status !== current.status ||
        candidate.description !== current.description;
      if (changed) {
        const updated = firstRow(
          await tx
            .update(delegations)
            .set(compactUpdate(dto))
            .where(eq(delegations.id, id))
            .returning({ id: delegations.id }),
        );
        if (!updated) throw new Error("Locked delegation update affected no rows");
      }
      const result = (await details(tx, withinScope))[0]!;
      if (changed || dto.status !== undefined) await audit(tx, "update", id, context, { patch: dto, changed });
      return { changed, result };
    });
  }
  async function search(input: DelegationSearchInput, scope: DelegationReadScope) {
    const query = DelegationSearchSchema.parse(input);
    const descendantOrg = alias(organizations, "delegation_search_descendant");
    return details(
      deps.db,
      and(
        scopePredicate(scope),
        query.clientIds === undefined ? undefined : inArray(delegations.clientId, query.clientIds),
        query.delegatorUsernames === undefined ? undefined : inArray(delegator.username, query.delegatorUsernames),
        query.delegateeUsernames === undefined ? undefined : inArray(delegatee.username, query.delegateeUsernames),
        query.statuses === undefined ? undefined : inArray(delegations.status, query.statuses),
        query.validTime === undefined
          ? undefined
          : and(lte(delegations.startTime, query.validTime), gte(delegations.endTime, query.validTime)),
        query.startTime === undefined ? undefined : gte(delegations.endTime, query.startTime),
        query.endTime === undefined ? undefined : lte(delegations.startTime, query.endTime),
        query.orgCodes === undefined
          ? undefined
          : exists(
              deps.db
                .select({ value: sql`1` })
                .from(organizationClosures)
                .innerJoin(descendantOrg, eq(descendantOrg.id, organizationClosures.descendantId))
                .where(
                  and(
                    eq(organizationClosures.ancestorId, delegations.organizationScopeId),
                    inArray(descendantOrg.orgCode, query.orgCodes),
                  ),
                ),
            ),
      ),
    );
  }
  async function selectUsers(query: DelegationSelectorQuery) {
    return deps.db
      .select({ id: users.id, username: users.username, name: users.name })
      .from(users)
      .where(
        and(
          query.purpose === "filter" ? undefined : and(eq(users.isDelete, false), eq(users.status, UserStatus.Enable)),
          query.search
            ? or(ilike(users.username, `%${query.search}%`), ilike(users.name, `%${query.search}%`))
            : undefined,
        ),
      )
      .orderBy(users.username)
      .limit(100);
  }
  async function selectClients(query: DelegationSelectorQuery) {
    return deps.db
      .select({ id: clients.id, clientCode: clients.clientCode, clientName: clients.clientName })
      .from(clients)
      .where(
        and(
          query.purpose === "filter"
            ? undefined
            : and(eq(clients.isDelete, false), eq(clients.status, ClientStatus.Enable)),
          query.search
            ? or(ilike(clients.clientCode, `%${query.search}%`), ilike(clients.clientName, `%${query.search}%`))
            : undefined,
        ),
      )
      .orderBy(clients.clientCode)
      .limit(100);
  }
  async function selectOrganizations(query: DelegationSelectorQuery) {
    return deps.db
      .select({ id: organizations.id, orgCode: organizations.orgCode, orgName: organizations.orgName })
      .from(organizations)
      .where(
        and(
          query.purpose === "filter"
            ? undefined
            : and(eq(organizations.isDelete, false), eq(organizations.status, OrganizationStatus.Enable)),
          query.search
            ? or(ilike(organizations.orgCode, `%${query.search}%`), ilike(organizations.orgName, `%${query.search}%`))
            : undefined,
        ),
      )
      .orderBy(organizations.orgCode)
      .limit(100);
  }
  return { create, update, search, selectUsers, selectClients, selectOrganizations };
}
export type DelegationService = ReturnType<typeof createDelegationService>;
