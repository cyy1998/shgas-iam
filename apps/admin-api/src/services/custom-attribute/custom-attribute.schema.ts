import { z } from "@hono/zod-openapi";
import { CustomAttributeDefinitionSchema } from "@iam/contracts/custom-attributes";

export const DefinitionKeySchema = CustomAttributeDefinitionSchema.pick({ entityType: true, code: true }).strict();
export const DefinitionListInputSchema = DefinitionKeySchema.pick({ entityType: true });
export const DefinitionCreateInputSchema = CustomAttributeDefinitionSchema.omit({ enabled: true })
  .extend({
    description: CustomAttributeDefinitionSchema.shape.description.optional(),
    orderNum: CustomAttributeDefinitionSchema.shape.orderNum.optional(),
    options: CustomAttributeDefinitionSchema.shape.options.optional(),
  })
  .strict();
export const DefinitionUpdateInputSchema = DefinitionKeySchema.extend({
  patch: CustomAttributeDefinitionSchema.pick({
    displayName: true,
    description: true,
    orderNum: true,
    options: true,
  })
    .partial()
    .strict(),
});
export const DefinitionSetEnabledInputSchema = DefinitionKeySchema.extend({
  enabled: z.boolean(),
});

export type DefinitionKey = z.infer<typeof DefinitionKeySchema>;
export type DefinitionCreateInput = z.infer<typeof DefinitionCreateInputSchema>;
export type DefinitionUpdateInput = z.infer<typeof DefinitionUpdateInputSchema>;
export type DefinitionSetEnabledInput = z.infer<typeof DefinitionSetEnabledInputSchema>;
