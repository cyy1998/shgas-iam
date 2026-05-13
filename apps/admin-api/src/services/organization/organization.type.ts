import type { z } from "@hono/zod-openapi";
import type {
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationTreeNodeDtoSchema,
  OrganizationUpdateDtoSchema,
} from "./organization.schema";

export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>;
export type OrganizationPaginationQueryDto = z.infer<typeof OrganizationPaginationQueryDtoSchema>;
export type OrganizationUpdateDto = z.infer<typeof OrganizationUpdateDtoSchema>;
export type OrganizationTreeNodeDto = z.infer<typeof OrganizationTreeNodeDtoSchema>;
