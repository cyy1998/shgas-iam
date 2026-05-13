import type { z } from "@hono/zod-openapi";
import type {
  OrganizationCreateDtoSchema,
  OrganizationQueryDtoSchema,
  OrganizationUpdateDtoSchema,
} from "./organization.schema";

export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>;
export type OrganizationQueryDto = z.infer<typeof OrganizationQueryDtoSchema>;
export type OrganizationUpdateDto = z.infer<typeof OrganizationUpdateDtoSchema>;
