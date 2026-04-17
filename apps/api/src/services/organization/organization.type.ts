import type { z } from "@hono/zod-openapi";
import type { OrganizationCreateDtoSchema, OrganizationDtoSchema, OrganizationQueryDtoSchema } from "./organization.schema";

export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;
export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>;
export type OrganizationQueryDto = z.infer<typeof OrganizationQueryDtoSchema>;
