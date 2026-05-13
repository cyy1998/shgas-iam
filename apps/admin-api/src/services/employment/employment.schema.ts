import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { EmploymentStatus, OrganizationType } from "@iam/contracts";
import { selectEmploymentSchema, selectUserSchema } from "@iam/db/schema";
import { OrganizationSchema } from "../organization/organization.schema";
import { PositionSchema } from "../position/position.schema";

export const EmploymentSchema = z.object(selectEmploymentSchema.shape);
const DbUserSchema = z.object(selectUserSchema.shape);

export const EmploymentDetailSchema = EmploymentSchema.extend({
  user: DbUserSchema,
  deptartment: OrganizationSchema,
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
}).extend({
  status: z.enum(EmploymentStatus),
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

export const EmploymentAdminPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({
        example: "138550",
        description: "模糊匹配 username / name",
      }),
    }),
    exactConditions: z.object({
      usernames: z.array(z.string()).optional().openapi({ example: ["138550"] }),
      companyOrgCodes: z.array(z.string()).optional().openapi({ example: ["SR"] }),
      deptOrgCodes: z.array(z.string()).optional().openapi({ example: ["SR23"] }),
      posCodes: z.array(z.string()).optional().openapi({ example: ["E033"] }),
      isPrimary: z.boolean().optional().openapi({ example: true }),
      statuses: z.array(z.enum(EmploymentStatus)).optional().openapi({
        example: [EmploymentStatus.Enable, EmploymentStatus.Pause],
        description: "未传则返回全部状态，前端默认注入 [Enable, Pause] 以隐藏已结束",
      }),
    }),
  }),
).openapi("EmploymentAdminPaginationQueryDto");

export const EmploymentAdminCreateDtoSchema = z.object({
  username: z.string().openapi({ example: "138550" }),
  companyOrgCode: z.string().openapi({ example: "SR" }),
  deptOrgCode: z.string().openapi({ example: "SR23" }),
  posCode: z.string().openapi({ example: "E033" }),
  isPrimary: z.boolean().optional().openapi({ example: false }),
  startTime: z.coerce.date().optional().openapi({
    example: "2026-04-23T00:00:00.000Z",
    description: "缺省则由后端写入 now()",
  }),
  description: z.string().max(500).nullable().optional(),
}).openapi("EmploymentAdminCreateDto");

export const EmploymentUpdateDtoSchema = z.object({
  isPrimary: z.boolean().optional(),
  startTime: z.coerce.date().optional(),
  description: z.string().max(500).nullable().optional(),
}).openapi("EmploymentUpdateDto");

export const EmploymentStatusUpdateDtoSchema = z.object({
  status: z.enum(EmploymentStatus),
}).openapi("EmploymentStatusUpdateDto");

export const EmploymentTransferDtoSchema = z.object({
  newCompanyOrgCode: z.string().openapi({ example: "SB" }),
  newDeptOrgCode: z.string().openapi({ example: "SB01" }),
  newPosCode: z.string().openapi({ example: "E034" }),
  startTime: z.coerce.date().optional().openapi({
    description: "新雇佣的 startTime；缺省 now()",
  }),
  inheritPrimary: z.boolean().optional().openapi({
    example: true,
    description: "是否继承原雇佣的 isPrimary；缺省 true",
  }),
  description: z.string().max(500).nullable().optional(),
}).openapi("EmploymentTransferDto");
