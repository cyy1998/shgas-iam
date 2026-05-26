import type { z } from "@hono/zod-openapi";
import type {
  OrganizationCreateDtoSchema,
  OrganizationDetailSchema,
  OrganizationDtoSchema,
  OrganizationSchema,
  OrganizationUpdateDtoSchema,
} from "./schema";

export type Organization = z.infer<typeof OrganizationSchema>;
export type OrganizationDetail = z.infer<typeof OrganizationDetailSchema>;
export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;
export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>;
export type OrganizationUpdateDto = z.infer<typeof OrganizationUpdateDtoSchema>;
