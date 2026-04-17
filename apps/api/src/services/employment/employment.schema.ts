import { z } from "@hono/zod-openapi";
import { EmploymentSchema as PrismaEmploymentSchema, UserSchema } from "@/db/generated/schemas";
import { Status } from "@/enums/status";
import { createPageQuerySchema } from "@/lib/core/pagination/schema";
import { OrganizationSchema } from "../organization/organization.schema";
import { PositionSchema } from "../position/position.schema";

export const EmploymentSchema = z.object(PrismaEmploymentSchema.shape);

export const EmploymentDetailSchema = EmploymentSchema.extend({
  user: UserSchema,
  deptartment: OrganizationSchema,
  company: OrganizationSchema,
  position: PositionSchema,
});

export const EmploymentDtoSchema = EmploymentSchema.extend({
  username: z.string().openapi({ example: "138550" }),
  name: z.string().openapi({ example: "蔡奕阳" }),
  mobile: z.string().nullable().openapi({ example: "17721462865" }),
  wxId: z.string().nullable().openapi({ example: "1592677631" }),
  posCode: z.string().openapi({ example: "E033" }),
  posName: z.string().openapi({ example: "职员" }),
  orgCode: z.string().openapi({ example: "SR23" }),
  orgType: z.string().openapi({ example: "部门" }),
  orgName: z.string().openapi({ example: "信息中心" }),
  compCode: z.string().openapi({ example: "SR" }),
  compName: z.string().openapi({ example: "上海燃气" }),
}).extend({
  status: z.enum(Status),
}).required().openapi("EmploymentDto");

export const EmploymentDtoConverterSchema = EmploymentDetailSchema.transform((e) => {
  const { user, position, deptartment, company, ...employment } = e;
  return {
    ...employment,
    username: user.username,
    name: user.name,
    mobile: user.mobile,
    wxId: user.wxId,
    posCode: position.posCode,
    posName: position.posName,
    orgCode: deptartment.orgCode,
    orgType: deptartment.orgType,
    orgName: deptartment.orgName,
    compCode: company.orgCode,
    compName: company.orgName,
  };
}).pipe(EmploymentDtoSchema);

export const EmploymentDetailDtoSchema = EmploymentDtoSchema.extend({
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentDetailDto");

export const EmploymentQueryDtoSchema = z.object({
  usernames: z.array(z.string()).optional().openapi({ example: ["138550", "136163"] }),
  phones: z.array(z.string()).optional().openapi({ example: ["17721462865"] }),
  wxIds: z.array(z.string()).optional().openapi({ example: ["1592677631"] }),
  ancestorOrgCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
  ancestorOrgDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  positionCodes: z.array(z.string()).optional().openapi({ example: ["E033", "E034"] }),
  roleCodes: z.array(z.string()).optional().openapi({ example: ["tender:default-user"] }),
}).openapi("EmploymentQueryDto");

export const EmploymentPaginationQueryDtoSchema = createPageQuerySchema(EmploymentQueryDtoSchema);

export const EmploymentCreateDtoSchema = EmploymentDtoSchema.pick({
  username: true,
  orgCode: true,
  posCode: true,
}).openapi("EmploymentCreateDto");
