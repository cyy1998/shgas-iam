import { z } from "@hono/zod-openapi";
import { selectEmploymentSchema, selectUserSchema } from "@iam/db/schema";
import { OrganizationSchema } from "../organization";
import { PositionDtoSchema } from "../position";

export const EmploymentSchema = z.object(selectEmploymentSchema.shape);
const DbUserSchema = z.object(selectUserSchema.shape);

export const EmploymentUserSummarySchema = DbUserSchema.pick({
  id: true,
  username: true,
  name: true,
  mobile: true,
  wxId: true,
}).openapi("EmploymentUserSummary");

export const EmploymentPositionSummarySchema = PositionDtoSchema.pick({
  id: true,
  posCode: true,
  posName: true,
}).openapi("EmploymentPositionSummary");

export const EmploymentOrgNodeSchema = OrganizationSchema.pick({
  id: true,
  orgCode: true,
  orgName: true,
  orgType: true,
  level: true,
  parentId: true,
  isVirtual: true,
  isEntity: true,
}).extend({
  pathIndex: z.number().int().nonnegative().openapi({ example: 0 }),
  distanceToAssignedOrg: z.number().int().nonnegative().openapi({ example: 1 }),
}).openapi("EmploymentOrgNode");

export const EmploymentOrganizationContextSchema = z.object({
  assignedOrg: EmploymentOrgNodeSchema,
  fullOrgPath: z.array(EmploymentOrgNodeSchema),
  companyNodes: z.array(EmploymentOrgNodeSchema),
}).openapi("EmploymentOrganizationContext");

export const EmploymentDetailSchema = EmploymentSchema.extend({
  user: DbUserSchema,
  organization: EmploymentOrganizationContextSchema,
  position: z.lazy(() => PositionDtoSchema),
});

export const EmploymentDtoSchema = EmploymentSchema.extend({
  user: EmploymentUserSummarySchema,
  position: EmploymentPositionSummarySchema,
  organization: EmploymentOrganizationContextSchema,
}).required().openapi("EmploymentDto");

export function toEmploymentDto(input: unknown) {
  const { user, position, organization, ...employment } = EmploymentDetailSchema.parse(input);
  return EmploymentDtoSchema.parse({
    ...employment,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      mobile: user.mobile,
      wxId: user.wxId,
    },
    position: {
      id: position.id,
      posCode: position.posCode,
      posName: position.posName,
    },
    organization,
  });
}

export const EmploymentDetailDtoSchema = EmploymentDtoSchema.extend({
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentDetailDto");
