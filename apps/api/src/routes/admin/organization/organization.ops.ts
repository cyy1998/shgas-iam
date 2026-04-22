import { z } from "zod";
import { Status } from "@/enums/status";
import { defineMutationOp, defineQueryOp } from "@/lib/core/business-op";
import {
  OrganizationCreateDtoSchema,
  OrganizationPaginationQueryDtoSchema,
  OrganizationUpdateDtoSchema,
} from "@/services/organization/organization.schema";
import * as organizationService from "@/services/organization/organization.service";

export const searchOrganizationOp = defineQueryOp({
  input: OrganizationPaginationQueryDtoSchema,
  handler: input => organizationService.searchOrganizationsForAdmin(input),
});

export const getOrganizationTreeOp = defineQueryOp({
  input: z.object({}).optional(),
  handler: () => organizationService.getOrganizationTreeForAdmin(),
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
    status: z.enum(Status),
  }),
  handler: ({ orgCode, status }) => organizationService.updateOrganizationStatus(orgCode, status),
});

export const deleteOrganizationOp = defineMutationOp({
  input: z.object({ orgCode: z.string() }),
  handler: ({ orgCode }) => organizationService.deleteOrganization(orgCode),
});
