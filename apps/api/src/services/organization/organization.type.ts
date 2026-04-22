import type { z } from "@hono/zod-openapi";
import type {
  OrganizationChildrenQueryDtoSchema,
  OrganizationCreateDtoSchema,
  OrganizationDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationQueryDtoSchema,
  OrganizationStatusUpdateDtoSchema,
  OrganizationTreeNodeDtoSchema,
  OrganizationUpdateDtoSchema,
} from "./organization.schema";

export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;
export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>;
export type OrganizationQueryDto = z.infer<typeof OrganizationQueryDtoSchema>;
export type OrganizationPaginationQueryDto = z.infer<typeof OrganizationPaginationQueryDtoSchema>;
export type OrganizationUpdateDto = z.infer<typeof OrganizationUpdateDtoSchema>;
export type OrganizationStatusUpdateDto = z.infer<typeof OrganizationStatusUpdateDtoSchema>;
export type OrganizationTreeNodeDto = z.infer<typeof OrganizationTreeNodeDtoSchema>;
export type OrganizationChildrenQueryDto = z.infer<typeof OrganizationChildrenQueryDtoSchema>;
