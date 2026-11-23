import {
  type CustomAttributeDefinition,
  CustomAttributeDefinitionSchema,
  type CustomAttributeEntityType,
  type CustomAttributeOption,
} from "@iam/contracts/custom-attributes";
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, snakeCase, text, unique, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { baseColumns } from "../_shard/base-columns";

export const CUSTOM_ATTRIBUTE_DEFINITION_CODE_UNIQUE = "custom_attribute_definition_entity_code_unique";

export const customAttributeDefinitions = snakeCase.table(
  "custom_attribute_definition",
  {
    id: baseColumns.id,
    entityType: varchar({ length: 16 }).$type<CustomAttributeEntityType>().notNull(),
    code: varchar({ length: 64 }).notNull(),
    valueType: varchar({ length: 16 }).$type<CustomAttributeDefinition["valueType"]>().notNull(),
    displayName: varchar({ length: 128 }).notNull(),
    description: text(),
    orderNum: integer().notNull().default(0),
    enabled: boolean().notNull().default(true),
    options: jsonb().$type<CustomAttributeOption[]>().notNull().default(sql`'[]'::jsonb`),
    createTime: baseColumns.createTime,
    updateTime: baseColumns.updateTime,
  },
  (table) => [
    unique(CUSTOM_ATTRIBUTE_DEFINITION_CODE_UNIQUE).on(table.entityType, table.code),
    check(
      "custom_attribute_definition_entity_type_check",
      sql`${table.entityType} IN ('user', 'organization', 'position')`,
    ),
    check("custom_attribute_definition_code_check", sql`${table.code} ~ '^[a-z][a-z0-9_]{0,63}$'`),
    check(
      "custom_attribute_definition_value_type_check",
      sql`${table.valueType} IN ('text', 'number', 'boolean', 'date', 'single_select', 'text_list')`,
    ),
    check(
      "custom_attribute_definition_options_check",
      sql`jsonb_typeof(${table.options}) = 'array' AND (${table.valueType} = 'single_select' OR ${table.options} = '[]'::jsonb)`,
    ),
  ],
);

export const selectCustomAttributeDefinitionSchema = createSelectSchema(
  customAttributeDefinitions,
  CustomAttributeDefinitionSchema.shape,
);
export const insertCustomAttributeDefinitionSchema = createInsertSchema(
  customAttributeDefinitions,
  CustomAttributeDefinitionSchema.shape,
).omit({ id: true, createTime: true, updateTime: true });
export const updateCustomAttributeDefinitionSchema = createUpdateSchema(
  customAttributeDefinitions,
  CustomAttributeDefinitionSchema.shape,
).omit({ id: true, entityType: true, code: true, valueType: true, createTime: true, updateTime: true });
