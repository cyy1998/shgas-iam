import type { z } from "@hono/zod-openapi";
import type { OrganizationResponsibilityTypeViewSchema } from "./schema";

export type OrganizationResponsibilityTypeView = z.infer<
  typeof OrganizationResponsibilityTypeViewSchema
>;
