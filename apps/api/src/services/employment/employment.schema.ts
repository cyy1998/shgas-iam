import { z } from "@hono/zod-openapi";
import { OrganizationType } from "@iam/contracts";
import { selectEmploymentSchema, selectUserSchema } from "@iam/db/schema";
import { OrganizationSchema } from "../organization/organization.schema";
import { PositionSchema } from "../position/position.schema";

export const EmploymentSchema = z.object(selectEmploymentSchema.shape);
const DbUserSchema = z.object(selectUserSchema.shape);

export const EmploymentDetailSchema = EmploymentSchema.extend({
  user: DbUserSchema,
  department: OrganizationSchema,
  company: OrganizationSchema,
  position: z.lazy(() => PositionSchema),
});

export const EmploymentDtoSchema = EmploymentSchema.extend({
  username: z.string().openapi({ example: "138550" }),
  name: z.string().openapi({ example: "蔡奕阳" }),
  mobile: z.string().nullable().openapi({ example: "17721462865" }),
  wxId: z.string().nullable().openapi({ example: "1592677631" }),
  posCode: z.string().openapi({ example: "E033" }),
  posName: z.string().openapi({ example: "职员" }),
  orgCode: z.string().openapi({ example: "SR23" }),
  orgType: z.enum(OrganizationType).openapi({ example: OrganizationType.Department }),
  orgName: z.string().openapi({ example: "信息中心" }),
  compCode: z.string().openapi({ example: "SR" }),
  compName: z.string().openapi({ example: "上海燃气" }),
}).required().openapi("EmploymentDto");

export function toEmploymentDto(input: unknown) {
  const { user, position, department, company, ...employment } = EmploymentDetailSchema.parse(input);
  return EmploymentDtoSchema.parse({
    ...employment,
    username: user.username,
    name: user.name,
    mobile: user.mobile,
    wxId: user.wxId,
    posCode: position.posCode,
    posName: position.posName,
    orgCode: department.orgCode,
    orgType: department.orgType,
    orgName: department.orgName,
    compCode: company.orgCode,
    compName: company.orgName,
  });
}

export const EmploymentDetailDtoSchema = EmploymentDtoSchema.extend({
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentDetailDto");
