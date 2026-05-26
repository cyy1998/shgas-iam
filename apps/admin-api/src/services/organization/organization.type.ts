import type { z } from "@hono/zod-openapi";
import type {
  OrganizationPaginationQueryDtoSchema,
  OrganizationTreeNodeDtoSchema,
} from "./organization.schema";

export type { OrganizationCreateDto, OrganizationUpdateDto } from "@iam/domain/organization";
export type OrganizationPaginationQueryDto = z.infer<typeof OrganizationPaginationQueryDtoSchema>;
export type OrganizationTreeNodeDto = z.infer<typeof OrganizationTreeNodeDtoSchema>;
