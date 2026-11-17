import type { UserCreateDto, UserPaginationQueryDto, UserUpdateDto } from "@admin-api/services/user/user.type";
import { ClientDelegationStatus, EmploymentStatus, OPEN_EMPLOYMENT_STATUSES, UserStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { extractPostgresError } from "@iam/db/postgres-error";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import {
  clientDelegations,
  employments,
  USER_MOBILE_UNIQUE_INDEX,
  USER_WX_ID_UNIQUE_INDEX,
  users,
  userWechatExternalBindings,
} from "@iam/db/schema";
import { MobileAlreadyExistsError, UsernameAlreadyExistsError, WxIdAlreadyExistsError } from "@iam/domain/user";
import { and, count, eq, inArray, isNull, or, sql } from "drizzle-orm";

function rethrowUserWriteError(error: unknown): never {
  const detail = extractPostgresError(error);
  if (detail?.code === "23505") {
    switch (detail.constraint) {
      case "user_username_key":
      case "user_username_unique":
        throw new UsernameAlreadyExistsError();
      case USER_MOBILE_UNIQUE_INDEX:
        throw new MobileAlreadyExistsError();
      case USER_WX_ID_UNIQUE_INDEX:
        throw new WxIdAlreadyExistsError();
    }
  }
  throw error;
}

export function createUserRepository(db: DbClient) {
  return {
    async getAnyUserByUsername(username: string) {
      return (await db.query.users.findFirst({ where: { username } })) ?? null;
    },
    async lockUserByUsername(username: string, includeDeleted = false) {
      return firstRow(
        await db
          .select()
          .from(users)
          .where(and(eq(users.username, username), includeDeleted ? undefined : eq(users.isDelete, false)))
          .for("update"),
      );
    },
    async getSessionManagementUserSummaries(userIds: readonly number[]) {
      if (userIds.length === 0) return [];
      return await db
        .select({
          id: users.id,
          subjectIdentifier: users.subjectIdentifier,
          username: users.username,
          name: users.name,
          status: users.status,
          isDelete: users.isDelete,
        })
        .from(users)
        .where(inArray(users.id, [...userIds]));
    },
    async getSessionManagementUserSummariesBySubjectIdentifiers(subjectIdentifiers: readonly string[]) {
      if (subjectIdentifiers.length === 0) return [];
      return await db
        .select({
          id: users.id,
          subjectIdentifier: users.subjectIdentifier,
          username: users.username,
          name: users.name,
          status: users.status,
          isDelete: users.isDelete,
        })
        .from(users)
        .where(inArray(users.subjectIdentifier, [...subjectIdentifiers]));
    },
    async setPassword(userId: number, password: string) {
      return firstRow(
        await db
          .update(users)
          .set({ password })
          .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
          .returning(),
      );
    },
    async unlinkWecom(userId: number) {
      return firstRow(
        await db
          .update(users)
          .set({ wxId: null })
          .where(and(eq(users.id, userId), eq(users.isDelete, false)))
          .returning(),
      );
    },
    async listWecomExternalBindings(userId: number) {
      const { id, openId, createTime, revokedAt } = userWechatExternalBindings;
      return await db
        .select({
          id,
          maskedOpenId: sql<string>`CASE WHEN char_length(${openId}) > 4 THEN '••••' || right(${openId}, 4) ELSE '••••' END`,
          createTime,
        })
        .from(userWechatExternalBindings)
        .where(and(eq(userWechatExternalBindings.userId, userId), isNull(revokedAt)))
        .orderBy(id);
    },
    async lockWecomExternalBinding(userId: number, bindingId: number) {
      return firstRow(
        await db
          .select({ revokedAt: userWechatExternalBindings.revokedAt })
          .from(userWechatExternalBindings)
          .where(and(eq(userWechatExternalBindings.userId, userId), eq(userWechatExternalBindings.id, bindingId)))
          .for("update"),
      );
    },
    async revokeWecomExternalBinding(userId: number, bindingId: number) {
      const changed = await db
        .update(userWechatExternalBindings)
        .set({ revokedAt: sql`statement_timestamp()` })
        .where(
          and(
            eq(userWechatExternalBindings.userId, userId),
            eq(userWechatExternalBindings.id, bindingId),
            isNull(userWechatExternalBindings.revokedAt),
          ),
        )
        .returning({ id: userWechatExternalBindings.id });
      return changed.length > 0;
    },
    async revokeAllWecomExternalBindings(userId: number) {
      await db
        .update(userWechatExternalBindings)
        .set({ revokedAt: sql`statement_timestamp()` })
        .where(and(eq(userWechatExternalBindings.userId, userId), isNull(userWechatExternalBindings.revokedAt)));
    },
    async getUserByUsernameForAdmin(username: string) {
      return (
        (await db.query.users.findFirst({
          where: {
            username,
            isDelete: false,
          },
        })) ?? null
      );
    },
    async getUserByUsernameIncludingDeletedForAuthorization(username: string) {
      return (
        (await db.query.users.findFirst({
          where: { username },
        })) ?? null
      );
    },
    async getOpenEmploymentOrganizationIdsByUserId(userId: number) {
      const rows = await db
        .selectDistinct({ organizationId: employments.orgId })
        .from(employments)
        .where(
          and(
            eq(employments.userId, userId),
            eq(employments.isDelete, false),
            inArray(employments.status, OPEN_EMPLOYMENT_STATUSES),
          ),
        )
        .orderBy(employments.orgId);
      return rows.map((row) => row.organizationId);
    },
    async getEndedEmploymentOrganizationIdsByUserId(userId: number) {
      const rows = await db
        .selectDistinct({ organizationId: employments.orgId })
        .from(employments)
        .where(
          and(
            eq(employments.userId, userId),
            eq(employments.isDelete, false),
            eq(employments.status, EmploymentStatus.Disable),
          ),
        )
        .orderBy(employments.orgId);
      return rows.map((row) => row.organizationId);
    },
    async getUserByIdForAdmin(id: number) {
      return (
        (await db.query.users.findFirst({
          where: {
            id,
            isDelete: false,
          },
        })) ?? null
      );
    },
    async getUserBySubjectIdentifierForPermittedAdmin(subjectIdentifier: string) {
      return (await db.query.users.findFirst({ where: { subjectIdentifier } })) ?? null;
    },
    async searchUsersFuzzyPaged(userPaginationQueryDto: UserPaginationQueryDto) {
      const { pageNum, pageSize } = userPaginationQueryDto;
      const where = usersFuzzyWhere(userPaginationQueryDto);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(users)
          .where(where)
          .orderBy(users.orderNum, users.id)
          .limit(pageSize)
          .offset((pageNum - 1) * pageSize),
        db.select({ value: count() }).from(users).where(where),
      ]);
      return { rows, total: firstRow(totalRows)?.value ?? 0 };
    },
    async updateUserByUsername(username: string, data: UserUpdateDto) {
      try {
        return firstRow(
          await db
            .update(users)
            .set(
              compactUpdate({
                name: data.name,
                mobile: data.mobile,
                userType: data.userType,
                status: data.status,
                orderNum: data.orderNum,
              }),
            )
            .where(and(eq(users.username, username), eq(users.isDelete, false)))
            .returning(),
        );
      } catch (error) {
        rethrowUserWriteError(error);
      }
    },
    async softDeleteUserByUsername(username: string) {
      return firstRow(
        await db
          .update(users)
          .set({ isDelete: true })
          .where(and(eq(users.username, username), eq(users.isDelete, false)))
          .returning(),
      );
    },
    async hasOpenClientDelegationsByUserId(userId: number) {
      const rows = await db
        .select({ id: clientDelegations.id })
        .from(clientDelegations)
        .where(
          and(
            inArray(clientDelegations.status, [ClientDelegationStatus.Enable, ClientDelegationStatus.Pause]),
            or(eq(clientDelegations.delegatorUserId, userId), eq(clientDelegations.delegateeUserId, userId)),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    async countOpenEmploymentsByUsername(username: string) {
      const rows = await db
        .select({ value: count() })
        .from(employments)
        .innerJoin(users, eq(employments.userId, users.id))
        .where(
          and(
            eq(employments.isDelete, false),
            inArray(employments.status, OPEN_EMPLOYMENT_STATUSES),
            eq(users.username, username),
            eq(users.isDelete, false),
          ),
        );
      return firstRow(rows)?.value ?? 0;
    },
    async setUserForAdmin(userCreateDto: UserCreateDto & { subjectIdentifier: string }) {
      try {
        return firstRow(await db.insert(users).values(userCreateDto).returning());
      } catch (error) {
        rethrowUserWriteError(error);
      }
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;

function usersFuzzyWhere(userPaginationQueryDto: UserPaginationQueryDto) {
  const text = userPaginationQueryDto.conditions.fuzzyConditions.text;
  return and(
    text !== undefined
      ? or(
          ilikeContainsIf(users.username, text),
          ilikeContainsIf(users.name, text),
          ilikeContainsIf(users.mobile, text),
          ilikeContainsIf(users.wxId, text),
        )
      : undefined,
    inArrayIf(users.userType, userPaginationQueryDto.conditions.exactConditions.userTypes),
    inArrayIf(users.username, userPaginationQueryDto.conditions.exactConditions.usernames),
    inArrayIf(users.mobile, userPaginationQueryDto.conditions.exactConditions.phones),
    inArrayIf(users.wxId, userPaginationQueryDto.conditions.exactConditions.wxIds),
    inArrayIf(users.status, userPaginationQueryDto.conditions.exactConditions.statuses),
    eq(users.isDelete, false),
  );
}
