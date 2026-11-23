import type { z } from "@hono/zod-openapi";
import type { CustomAttributeValues } from "@iam/contracts/custom-attributes";
import type { Organization as SharedOrganization } from "@iam/domain/organization";

import type {
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationPathNodeSchema,
  OrganizationSelectorNodeSchema,
  OrganizationSelectorQueryDtoSchema,
  OrganizationTreeNodeDtoSchema,
  OrganizationUpdateDtoSchema,
} from "./organization.schema";

export type Organization = SharedOrganization & { customAttributes?: CustomAttributeValues };
export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>;
export type OrganizationUpdateDto = z.infer<typeof OrganizationUpdateDtoSchema>;
export type OrganizationCreateValues = Omit<OrganizationCreateDto, "customAttributes"> & {
  customAttributes?: CustomAttributeValues;
};
export type OrganizationUpdateValues = Omit<OrganizationUpdateDto, "customAttributes"> & {
  customAttributes?: CustomAttributeValues;
};
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
