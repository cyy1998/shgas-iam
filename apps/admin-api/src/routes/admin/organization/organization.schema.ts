import { OrganizationDtoSchema } from "@admin-api/services/organization/organization.schema";
import { z } from "@hono/zod-openapi";
import { AdminOrganizationAllowedActionsSchema } from "@iam/contracts";
import { CustomAttributeDefinitionSchema, CustomAttributeValuesSchema } from "@iam/contracts/custom-attributes";

export const OrganizationCreatedVoSchema = OrganizationDtoSchema.extend({
  customAttributes: CustomAttributeValuesSchema.optional(),
}).openapi("OrganizationCreatedVo");

export const OrganizationVoSchema = OrganizationDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
  childrenCount: z.number().openapi({ example: 3 }),
}).openapi("OrganizationVo");

export const OrganizationDetailVoSchema = OrganizationVoSchema.extend({
  customAttributes: CustomAttributeValuesSchema.optional(),
  customAttributeDefinitions: z.array(CustomAttributeDefinitionSchema).optional(),
  employmentCount: z.number().openapi({ example: 12 }),
  allowedActions: AdminOrganizationAllowedActionsSchema,
}).openapi("OrganizationDetailVo");
