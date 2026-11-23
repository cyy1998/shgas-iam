import { z } from "zod";

export const CustomAttributeEntityTypeSchema = z.enum(["user", "organization", "position"]);
export const CustomAttributeValueTypeSchema = z.enum([
  "text",
  "number",
  "boolean",
  "date",
  "single_select",
  "text_list",
]);

export const CustomAttributeCodeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/u, "编码须以小写字母开头，仅含小写字母、数字和下划线，最多 64 个字符");
const AttributeTextSchema = z
  .string()
  .refine((text) => !text.includes("\0") && !/[\uD800-\uDFFF]/u.test(text), "文本包含无效字符");
export const CustomAttributeOptionSchema = z.object({
  code: CustomAttributeCodeSchema,
  displayName: AttributeTextSchema.trim().min(1).max(128),
  enabled: z.boolean(),
});
export const CustomAttributeDefinitionSchema = z.object({
  entityType: CustomAttributeEntityTypeSchema,
  code: CustomAttributeCodeSchema,
  valueType: CustomAttributeValueTypeSchema,
  displayName: CustomAttributeOptionSchema.shape.displayName,
  description: AttributeTextSchema.max(1024).nullable(),
  orderNum: z.int32(),
  enabled: z.boolean(),
  options: z.array(CustomAttributeOptionSchema),
});

export const CustomAttributeValueSchema = z.union([
  AttributeTextSchema,
  z.number(),
  z.boolean(),
  z.array(AttributeTextSchema),
]);
export const CustomAttributeValuesSchema = z.record(CustomAttributeCodeSchema, CustomAttributeValueSchema);
export const PublishedCustomAttributesSchema = CustomAttributeValuesSchema.refine(
  (values) => Object.keys(values).length > 0,
  "未填写自定义属性时省略属性对象",
).optional();
export const CustomAttributePatchSchema = z.record(CustomAttributeCodeSchema, CustomAttributeValueSchema.nullable());

export type CustomAttributeEntityType = z.infer<typeof CustomAttributeEntityTypeSchema>;
export type CustomAttributeDefinition = z.infer<typeof CustomAttributeDefinitionSchema>;
export type CustomAttributeOption = z.infer<typeof CustomAttributeOptionSchema>;
export type CustomAttributeValue = z.infer<typeof CustomAttributeValueSchema>;
export type CustomAttributeValues = z.infer<typeof CustomAttributeValuesSchema>;
export type CustomAttributePatch = z.infer<typeof CustomAttributePatchSchema>;
