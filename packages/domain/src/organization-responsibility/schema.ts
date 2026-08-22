import { z } from "@hono/zod-openapi";
import {
  OrganizationResponsibilityAssignmentCardinality,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";

export const OrganizationResponsibilityTypeViewSchema = z.strictObject({
  code: z.enum(OrganizationResponsibilityTypeCode),
  name: z.string().min(1),
  description: z.string().min(1),
  assignmentCardinality: z.enum(OrganizationResponsibilityAssignmentCardinality),
  displayOrder: z.number().int(),
});
