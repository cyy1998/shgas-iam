import { z } from "@hono/zod-openapi";
import {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";

export const OrganizationResponsibilityAssignmentCreateDtoSchema
  = z.strictObject({
    typeCode: z.enum(OrganizationResponsibilityTypeCode),
    employmentId: z.number().int().positive(),
  });

export const OrganizationResponsibilityAssignmentListQuerySchema
  = z.strictObject({
    cursor: z.string().regex(/^\d+$/u).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    employmentId: z.coerce.number().int().positive().optional(),
    typeCode: z.enum(OrganizationResponsibilityTypeCode).optional(),
    lifecycle: z.enum(["open", "ended", "all"]).default("open"),
  });

export const OrganizationResponsibilityAssignmentSearchQuerySchema
  = OrganizationResponsibilityAssignmentListQuerySchema.extend({
    targetOrganizationCode: z.string().min(1).optional(),
  });

export type OrganizationResponsibilityAssignmentLifecycle = z.infer<
  typeof OrganizationResponsibilityAssignmentListQuerySchema
>["lifecycle"];
export type OrganizationResponsibilityAssignmentSearchQuery = z.infer<
  typeof OrganizationResponsibilityAssignmentSearchQuerySchema
>;

const OrganizationSummarySchema = z.object({
  id: z.number().int().positive(),
  orgCode: z.string(),
  orgName: z.string(),
});

const OrganizationWithFullPathSchema = OrganizationSummarySchema.extend({
  fullPath: z.array(OrganizationSummarySchema),
});

export const OrganizationResponsibilityAssignmentViewSchema = z.object({
  id: z.number().int().positive(),
  typeCode: z.enum(OrganizationResponsibilityTypeCode),
  status: z.enum(OrganizationResponsibilityAssignmentStatus),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().nullable(),
  holder: z.object({
    employmentId: z.number().int().positive(),
    user: z.object({
      id: z.number().int().positive(),
      username: z.string(),
      name: z.string(),
    }),
    organization: OrganizationWithFullPathSchema,
    position: z.object({
      id: z.number().int().positive(),
      posCode: z.string(),
      posName: z.string(),
    }),
  }),
  targetOrganization: OrganizationWithFullPathSchema,
});

export const OrganizationResponsibilityAssignmentCursorPageSchema = z.object({
  items: z.array(OrganizationResponsibilityAssignmentViewSchema),
  nextCursor: z.string().nullable(),
});

export type OrganizationResponsibilityAssignmentCreateDto = z.infer<
  typeof OrganizationResponsibilityAssignmentCreateDtoSchema
>;
export type OrganizationResponsibilityAssignmentView = z.infer<
  typeof OrganizationResponsibilityAssignmentViewSchema
>;
