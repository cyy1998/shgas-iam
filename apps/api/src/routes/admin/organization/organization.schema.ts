import { OrganizationDtoSchema } from "@api/services/organization/organization.schema";
import { z } from "@hono/zod-openapi";

export const OrganizationVoSchema = OrganizationDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
  childrenCount: z.number().openapi({ example: 3 }),
}).openapi("OrganizationVo");

export const OrganizationDetailVoSchema = OrganizationVoSchema.extend({
  employmentCount: z.number().openapi({ example: 12 }),
}).openapi("OrganizationDetailVo");
