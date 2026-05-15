import { z } from "@hono/zod-openapi";
import { OrganizationLevel, OrganizationType } from "@iam/contracts";

export {
  OrganizationCreateDtoSchema,
  OrganizationDetailSchema,
  OrganizationDtoSchema,
  OrganizationSchema,
  OrganizationUpdateDtoSchema,
  toOrganizationDto,
} from "@iam/domain/organization";

export const OrganizationQueryDtoSchema = z.object({
  orgTypes: z.array(z.enum(OrganizationType)).optional().openapi({
    example: [OrganizationType.Department, OrganizationType.Company],
  }),
  orgLevels: z.array(z.enum(OrganizationLevel)).optional().openapi({
    example: [OrganizationLevel.One, OrganizationLevel.Two],
  }),
  ancestorCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
  ancestorDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  descendantCodes: z.array(z.string()).optional().openapi({ example: ["SR01", "SB01"] }),
  descendantDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  orgCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
}).openapi("OrganizationQueryDto");
