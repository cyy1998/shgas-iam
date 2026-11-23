import { ApiErrorCode } from "@iam/contracts";
import type { CustomAttributeDefinition, CustomAttributeEntityType } from "@iam/contracts/custom-attributes";
import { HttpStatusCodes } from "@iam/contracts/http";
import type { DbClient } from "@iam/db";
import { extractPostgresError } from "@iam/db/postgres-error";
import { firstRow } from "@iam/db/query-utils";
import { CUSTOM_ATTRIBUTE_DEFINITION_CODE_UNIQUE, customAttributeDefinitions as definitions } from "@iam/db/schema";
import { CustomError } from "@iam/runtime/errors";
import { and, eq, inArray } from "drizzle-orm";
import type { DefinitionChanges } from "./custom-attribute.port";
import type { DefinitionKey } from "./custom-attribute.schema";

export function createCustomAttributeRepository(db: DbClient) {
  return {
    async list(entityType: CustomAttributeEntityType, enabledOnly = false) {
      return await db
        .select()
        .from(definitions)
        .where(and(eq(definitions.entityType, entityType), enabledOnly ? eq(definitions.enabled, true) : undefined))
        .orderBy(definitions.orderNum, definitions.code);
    },

    // Object updates hold their object lock first. Definition edits lock only the definition.
    async lockForValues(entityType: CustomAttributeEntityType, codes: string[]) {
      if (codes.length === 0) return [];
      return await db
        .select()
        .from(definitions)
        .where(and(eq(definitions.entityType, entityType), inArray(definitions.code, codes)))
        .orderBy(definitions.code)
        .for("share");
    },

    async lock({ entityType, code }: DefinitionKey) {
      return firstRow(
        await db
          .select()
          .from(definitions)
          .where(and(eq(definitions.entityType, entityType), eq(definitions.code, code)))
          .for("update"),
      );
    },

    async insert(input: CustomAttributeDefinition) {
      try {
        const row = firstRow(await db.insert(definitions).values(input).returning());
        if (!row) throw new Error("Custom Attribute Definition insert returned no row");
        return row;
      } catch (error) {
        const postgresError = extractPostgresError(error);
        if (postgresError?.code === "23505" && postgresError.constraint === CUSTOM_ATTRIBUTE_DEFINITION_CODE_UNIQUE) {
          throw new CustomError("该对象类别已使用此属性编码", {
            code: ApiErrorCode.CustomAttributeDefinitionCodeConflict,
            httpStatus: HttpStatusCodes.CONFLICT,
          });
        }
        throw error;
      }
    },

    async update(id: number, patch: DefinitionChanges) {
      return firstRow(await db.update(definitions).set(patch).where(eq(definitions.id, id)).returning());
    },
  };
}
