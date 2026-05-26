import type { z } from "@hono/zod-openapi";
import type { OrganizationQueryDtoSchema } from "./organization.schema";

export type { OrganizationCreateDto, OrganizationUpdateDto } from "@iam/domain/organization";
export type OrganizationQueryDto = z.infer<typeof OrganizationQueryDtoSchema>;
