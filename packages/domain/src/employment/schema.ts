import { z } from "@hono/zod-openapi";
import { OrganizationType } from "@iam/contracts";
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

const DeprecatedStringSchema = z.string().openapi({
  description: "Deprecated compatibility field. Prefer the structured user, position, or organization field.",
  deprecated: true,
});

const DeprecatedNullableStringSchema = z.string().nullable().openapi({
  description: "Deprecated compatibility field. Prefer organization.companyNodes; null when no Company ancestor exists.",
  deprecated: true,
});

export const EmploymentDtoSchema = EmploymentSchema.extend({
  user: EmploymentUserSummarySchema,
  position: EmploymentPositionSummarySchema,
  organization: EmploymentOrganizationContextSchema,
  username: DeprecatedStringSchema.openapi({ example: "138550" }),
  name: DeprecatedStringSchema.openapi({ example: "蔡奕阳" }),
  mobile: DeprecatedNullableStringSchema.openapi({ example: "17721462865" }),
  wxId: DeprecatedNullableStringSchema.openapi({ example: "1592677631" }),
  posCode: DeprecatedStringSchema.openapi({ example: "E033" }),
  posName: DeprecatedStringSchema.openapi({ example: "职员" }),
  orgCode: DeprecatedStringSchema.openapi({ example: "SR23" }),
  orgType: z.enum(OrganizationType).openapi({
    example: OrganizationType.Department,
    description: "Deprecated compatibility field. Prefer organization.assignedOrg.orgType.",
    deprecated: true,
  }),
  orgName: DeprecatedStringSchema.openapi({ example: "信息中心" }),
  compCode: DeprecatedNullableStringSchema.openapi({ example: "SR" }),
  compName: DeprecatedNullableStringSchema.openapi({ example: "上海燃气" }),
}).required().openapi("EmploymentDto");

export function toEmploymentDto(input: unknown) {
  const { user, position, organization, ...employment } = EmploymentDetailSchema.parse(input);
  const nearestCompany = organization.companyNodes.at(-1) ?? null;
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
    username: user.username,
    name: user.name,
    mobile: user.mobile,
    wxId: user.wxId,
    posCode: position.posCode,
    posName: position.posName,
    orgCode: organization.assignedOrg.orgCode,
    orgType: organization.assignedOrg.orgType,
    orgName: organization.assignedOrg.orgName,
    compCode: nearestCompany?.orgCode ?? null,
    compName: nearestCompany?.orgName ?? null,
  });
}

export const EmploymentDetailDtoSchema = EmploymentDtoSchema.extend({
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentDetailDto");
