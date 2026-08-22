import type { DbClient } from "@iam/db";
import type { SQLWrapper } from "drizzle-orm";
import type { UserProfileSearchInput } from "./user-profile-query.port";
import type {
  PublishedUserProfile,
  UserProfileEmploymentField,
  UserProfileFilterCondition,
  UserProfileFilterDsl,
  UserProfileUserField,
} from "./user-profile.schema";
import { firstRow, inArrayIf } from "@iam/db/query-utils";
import { userProfiles } from "@iam/db/schema";
import { and, asc, eq, isNull, lte, not, or, sql } from "drizzle-orm";
import { USER_PROFILE_SCHEMA_VERSION } from "./profile.schema";
import { createUserProfileRowRepository } from "./user-profile-row.repository";
import {
  isEmploymentField,
  PublishedUserProfileSchema,
} from "./user-profile.schema";

export type UserProfileUpsertInput = PublishedUserProfile;

export function createLegacyV1UserProfileRepository(db: DbClient) {
  const rowRepository = createUserProfileRowRepository(db);
  return {
    async upsertProfile(input: UserProfileUpsertInput) {
      return await rowRepository.upsert(PublishedUserProfileSchema.parse(input));
    },

    async deleteByUserId(userId: number) {
      return firstRow(await db
        .delete(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .returning()) ?? null;
    },

    async deleteByUserIdAtMostVersion(input: { userId: number; sourceDirtyVersion: string }) {
      return firstRow(await db
        .delete(userProfiles)
        .where(and(
          eq(userProfiles.userId, input.userId),
          or(
            isNull(userProfiles.sourceDirtyVersion),
            lte(userProfiles.sourceDirtyVersion, input.sourceDirtyVersion),
          ),
        ))
        .returning()) ?? null;
    },

    async getAnyByUserId(userId: number) {
      return await db.query.userProfiles.findFirst({ where: { userId } }) ?? null;
    },

    async getCurrentByUserId(userId: number) {
      return await db.query.userProfiles.findFirst({
        where: {
          userId,
          profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION,
        },
      }) ?? null;
    },

    async getCurrentByUsername(username: string) {
      return await db.query.userProfiles.findFirst({
        where: {
          username,
          profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION,
        },
      }) ?? null;
    },

    async getCurrentByMobile(mobile: string) {
      return await db.query.userProfiles.findFirst({
        where: {
          mobile,
          profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION,
        },
      }) ?? null;
    },

    async getCurrentByWxId(wxId: string) {
      return await db.query.userProfiles.findFirst({
        where: {
          wxId,
          profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION,
        },
      }) ?? null;
    },

    async searchCurrentVisibleProfiles(input: UserProfileSearchInput = {}) {
      const predicate = and(
        eq(userProfiles.profileSchemaVersion, USER_PROFILE_SCHEMA_VERSION),
        eq(userProfiles.searchVisible, true),
        input.filter === undefined ? undefined : compileProfileFilterDslToSql(input.filter),
      );

      const query = db
        .select()
        .from(userProfiles)
        .where(predicate)
        .orderBy(asc(userProfiles.userId));

      return input.limit === undefined ? await query : await query.limit(input.limit);
    },
  };
}

export type LegacyV1UserProfileRepository = ReturnType<
  typeof createLegacyV1UserProfileRepository
>;

function compileProfileFilterDslToSql(filter: UserProfileFilterDsl): SQLWrapper {
  if ("field" in filter)
    return compileUserConditionToSql(filter);

  if ("all" in filter)
    return and(...filter.all.map(compileProfileFilterDslToSql)) ?? sql`true`;

  if ("any" in filter)
    return or(...filter.any.map(compileProfileFilterDslToSql)) ?? sql`false`;

  if ("not" in filter)
    return not(compileProfileFilterDslToSql(filter.not));

  return compileEmploymentNestedToSql(filter.where);
}

function compileUserConditionToSql(condition: UserProfileFilterCondition): SQLWrapper {
  if (isEmploymentField(condition.field)) {
    return sql`false`;
  }

  const column = userColumnForField(condition.field);
  if (column !== null) {
    if (condition.op === "eq") {
      return condition.value === null ? isNull(column as any) : eq(column as any, condition.value as any);
    }
    if (condition.op === "in") {
      return Array.isArray(condition.value) ? inArrayIf(column, condition.value) ?? sql`true` : sql`false`;
    }
    return sql`false`;
  }

  return compileJsonContainsCondition(["user", condition.field.replace("user.", "")], condition);
}

function compileEmploymentNestedToSql(filter: UserProfileFilterDsl): SQLWrapper {
  return compileEmploymentNodeToSql(filter);
}

function compileEmploymentNodeToSql(filter: UserProfileFilterDsl): SQLWrapper {
  if ("field" in filter) {
    if (!isEmploymentField(filter.field))
      return compileUserConditionToSql(filter);
    return or(...employmentContainmentsForCondition(filter).map(jsonbEmploymentContains)) ?? sql`false`;
  }

  if ("all" in filter) {
    const alternatives = filter.all
      .map(employmentContainmentAlternatives)
      .reduce(
        (combined, alternatives) => crossMergeContainments(combined, alternatives),
        [{}] as JsonObject[],
      );
    return or(...alternatives.map(jsonbEmploymentContains)) ?? sql`false`;
  }

  if ("any" in filter)
    return or(...filter.any.map(compileEmploymentNodeToSql)) ?? sql`false`;

  if ("not" in filter)
    return not(compileEmploymentNodeToSql(filter.not));

  return compileEmploymentNodeToSql(filter.where);
}

function employmentContainmentAlternatives(filter: UserProfileFilterDsl): JsonObject[] {
  if ("field" in filter) {
    if (!isEmploymentField(filter.field))
      return [{}];
    return employmentContainmentsForCondition(filter);
  }

  if ("all" in filter) {
    return filter.all
      .map(employmentContainmentAlternatives)
      .reduce(
        (combined, alternatives) => crossMergeContainments(combined, alternatives),
        [{}] as JsonObject[],
      );
  }

  if ("any" in filter)
    return filter.any.flatMap(employmentContainmentAlternatives);

  if ("nested" in filter)
    return employmentContainmentAlternatives(filter.where);

  return [{}];
}

function employmentContainmentsForCondition(condition: UserProfileFilterCondition): JsonObject[] {
  if (!isEmploymentField(condition.field))
    return [{}];

  if (condition.op === "eq")
    return [employmentFieldContainment(condition.field, condition.value)];

  if (!Array.isArray(condition.value))
    return [];

  if (condition.value.length === 0)
    return [];

  if (condition.op === "in" || condition.op === "containsAny") {
    return condition.value.map(value =>
      employmentFieldContainment(condition.field as UserProfileEmploymentField, value),
    );
  }

  return [employmentFieldContainment(condition.field, condition.value)];
}

function employmentFieldContainment(field: UserProfileEmploymentField, value: unknown): JsonObject {
  switch (field) {
    case "employment.id":
      return { id: value };
    case "employment.org.id":
      return { org: { id: value } };
    case "employment.org.code":
      return { org: { code: value } };
    case "employment.org.ancestorCodes":
      return { org: { ancestorCodes: toArray(value) } };
    case "employment.org.ancestorDepths":
      return { org: { ancestorDepths: toArray(value) } };
    case "employment.org.ancestorKeys":
      return { org: { ancestorKeys: toArray(value) } };
    case "employment.org.companyCodes":
      return { org: { companyCodes: toArray(value) } };
    case "employment.position.id":
      return { position: { id: value } };
    case "employment.position.code":
      return { position: { code: value } };
    case "employment.roles":
      return { roles: toArray(value) };
    case "employment.privileges":
      return { privileges: toArray(value) };
    case "employment.isPrimary":
      return { isPrimary: value };
  }
}

function compileJsonContainsCondition(path: string[], condition: UserProfileFilterCondition): SQLWrapper {
  if (condition.op === "eq")
    return jsonbSearchDocContains(toNestedObject(path, condition.value));

  if (!Array.isArray(condition.value) || condition.value.length === 0)
    return sql`false`;

  if (condition.op === "in" || condition.op === "containsAny") {
    return or(...condition.value.map(value => jsonbSearchDocContains(toNestedObject(path, value)))) ?? sql`false`;
  }

  return jsonbSearchDocContains(toNestedObject(path, condition.value));
}

function userColumnForField(field: UserProfileUserField) {
  switch (field) {
    case "user.id":
      return userProfiles.userId;
    case "user.username":
      return userProfiles.username;
    case "user.mobile":
      return userProfiles.mobile;
    case "user.wxId":
      return userProfiles.wxId;
    case "user.status":
      return userProfiles.status;
    case "user.name":
    case "user.userType":
      return null;
  }
}

function jsonbEmploymentContains(containment: JsonObject): SQLWrapper {
  return jsonbSearchDocContains({ employments: [containment] });
}

function jsonbSearchDocContains(containment: JsonObject): SQLWrapper {
  return sql`${userProfiles.searchDoc} @> ${JSON.stringify(containment)}::jsonb`;
}

function crossMergeContainments(left: JsonObject[], right: JsonObject[]) {
  if (left.length === 0 || right.length === 0)
    return [];

  return left.flatMap(leftItem => right.map(rightItem => deepMerge(leftItem, rightItem)));
}

function deepMerge(left: JsonObject, right: JsonObject): JsonObject {
  const output: JsonObject = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const existing = output[key];
    output[key] = isPlainObject(existing) && isPlainObject(value)
      ? deepMerge(existing, value)
      : value;
  }
  return output;
}

function toNestedObject(path: string[], value: unknown): JsonObject {
  const [head, ...tail] = path;
  if (head === undefined)
    return value as JsonObject;
  return {
    [head]: tail.length === 0 ? value : toNestedObject(tail, value),
  };
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [value];
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type JsonObject = Record<string, unknown>;
