import type {
  CustomAttributeDefinition,
  CustomAttributeEntityType,
  CustomAttributeValues,
} from "@iam/contracts/custom-attributes";
import type { DbClient } from "@iam/db";
import { customAttributeDefinitions } from "@iam/db/schema";
import { selectActiveCustomAttributeValues } from "@iam/domain/custom-attributes";
import type { SQLWrapper } from "drizzle-orm";
import { and, eq, inArray, sql } from "drizzle-orm";

export type DocumentCustomAttributeDefinition = Pick<CustomAttributeDefinition, "entityType" | "code" | "enabled">;

export function customAttributeKeyExists(column: SQLWrapper, code: string) {
  return sql`${column} ? ${code}`;
}

export function hasCustomAttributeValues(values: CustomAttributeValues) {
  return Object.keys(values).length > 0;
}

export async function loadEnabledDocumentCustomAttributeDefinitions(
  db: DbClient,
  entityTypes: CustomAttributeEntityType[],
): Promise<DocumentCustomAttributeDefinition[]> {
  if (entityTypes.length === 0) return [];
  const { entityType, code, enabled } = customAttributeDefinitions;
  return await db
    .select({ entityType, code, enabled })
    .from(customAttributeDefinitions)
    .where(and(inArray(entityType, entityTypes), eq(enabled, true)));
}

export function documentCustomAttributeFields(
  values: CustomAttributeValues,
  definitions: readonly DocumentCustomAttributeDefinition[],
): { customAttributes?: CustomAttributeValues } {
  if (!hasCustomAttributeValues(values)) return {};
  const customAttributes = selectActiveCustomAttributeValues(values, definitions);
  return hasCustomAttributeValues(customAttributes) ? { customAttributes } : {};
}
