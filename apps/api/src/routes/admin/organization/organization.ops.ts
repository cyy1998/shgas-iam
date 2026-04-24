import { z } from "zod";
import { OrganizationStatus } from "@/enums/organization.status";
import { defineMutationOp, defineQueryOp } from "@/lib/core/business-op";
import {
  OrganizationChildrenQueryDtoSchema,
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@/services/organization/organization.schema";
import * as organizationService from "@/services/organization/organization.service";

export const searchOrganizationOp = defineQueryOp({
  input: OrganizationPaginationQueryDtoSchema,
  handler: input => organizationService.searchOrganizationsForAdmin(input),
});

export const getOrganizationChildrenOp = defineQueryOp({
  input: OrganizationChildrenQueryDtoSchema,
  handler: ({ parentOrgCode, pageNum, pageSize }) =>
    organizationService.getOrganizationChildrenForAdmin(parentOrgCode ?? null, pageNum, pageSize),
});

export const getOrganizationOp = defineQueryOp({
  input: z.object({ orgCode: z.string() }),
  handler: ({ orgCode }) => organizationService.getOrganizationDetailByCodeForAdmin(orgCode),
});

export const createOrganizationOp = defineMutationOp({
  input: OrganizationCreateDtoSchema,
  handler: input => organizationService.setOrganization(input),
});

export const updateOrganizationOp = defineMutationOp({
  input: z.object({
    orgCode: z.string(),
    data: OrganizationUpdateDtoSchema,
  }),
  handler: ({ orgCode, data }) => organizationService.updateOrganization(orgCode, data),
});

export const updateOrganizationStatusOp = defineMutationOp({
  input: z.object({
    orgCode: z.string(),
    status: z.enum(OrganizationStatus),
  }),
  handler: ({ orgCode, status }) => organizationService.updateOrganizationStatus(orgCode, status),
});

export const deleteOrganizationOp = defineMutationOp({
  input: z.object({ orgCode: z.string() }),
  handler: ({ orgCode }) => organizationService.deleteOrganization(orgCode),
});
