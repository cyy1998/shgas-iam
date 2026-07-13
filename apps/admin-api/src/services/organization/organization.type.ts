import type { z } from "@hono/zod-openapi";
import type { Organization } from "@iam/domain/organization";

import type {
  OrganizationPaginationQueryDtoSchema,
  OrganizationPathNodeSchema,
  OrganizationSelectorNodeSchema,
  OrganizationSelectorQueryDtoSchema,
  OrganizationTreeNodeDtoSchema,
} from "./organization.schema";

export type { Organization, OrganizationCreateDto, OrganizationUpdateDto } from "@iam/domain/organization";
export type OrganizationPaginationQueryDto = z.infer<typeof OrganizationPaginationQueryDtoSchema>;
export type OrganizationTreeNodeDto = z.infer<typeof OrganizationTreeNodeDtoSchema>;
export type OrganizationPathNode = z.infer<typeof OrganizationPathNodeSchema>;
export type OrganizationSelectorNode = z.infer<typeof OrganizationSelectorNodeSchema>;
export type OrganizationSelectorQueryDto = z.infer<typeof OrganizationSelectorQueryDtoSchema>;

export type AdminOrganizationRecord = Organization & {
  parent: Organization | null;
  children: Organization[];
};

export type AdminOrganizationChildRecord = Organization & {
  childCount: number;
};
