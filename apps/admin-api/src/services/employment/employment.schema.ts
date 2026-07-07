import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { EmploymentStatus, OrganizationType } from "@iam/contracts";

export {
  EmploymentDetailDtoSchema,
  EmploymentDetailSchema,
  EmploymentDtoSchema,
  EmploymentSchema,
  toEmploymentDto,
} from "@iam/domain/employment";

export const EmploymentAdminPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({
        example: "138550",
        description: "模糊匹配任职 ID、username/name、组织编码/名称、岗位编码/名称",
      }),
    }),
    exactConditions: z.object({
      usernames: z.array(z.string()).optional().openapi({ example: ["138550"] }),
      organization: z.object({
        orgCodes: z.array(z.string()).optional().openapi({ example: ["SR23"] }),
        matchMode: z.enum(["exact", "subtree", "company"]).default("exact").openapi({ example: "subtree" }),
        orgTypes: z.array(z.enum(OrganizationType)).optional().openapi({ example: [OrganizationType.Department] }),
      }).optional().openapi({
        description: "统一组织过滤；exact 匹配实际任职组织，subtree 匹配任意祖先子树，company 匹配 Company 祖先。",
      }),
      companyOrgCodes: z.array(z.string()).optional().openapi({
        example: ["SR"],
        description: "Deprecated compatibility input. Prefer exactConditions.organization with matchMode=company.",
        deprecated: true,
      }),
      deptOrgCodes: z.array(z.string()).optional().openapi({
        example: ["SR23"],
        description: "Deprecated compatibility input. Prefer exactConditions.organization with matchMode=exact.",
        deprecated: true,
      }),
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
  orgCode: z.string().optional().openapi({ example: "SR23", description: "实际任职组织编码" }),
  expectedAncestorOrgCode: z.string().optional().openapi({
    example: "SR",
    description: "可选祖先组织校验；不入库",
  }),
  companyOrgCode: z.string().optional().openapi({
    example: "SR",
    description: "Deprecated compatibility input. Used as expectedAncestorOrgCode when provided.",
    deprecated: true,
  }),
  deptOrgCode: z.string().optional().openapi({
    example: "SR23",
    description: "Deprecated compatibility input. Used as orgCode when orgCode is omitted.",
    deprecated: true,
  }),
  posCode: z.string().openapi({ example: "E033" }),
  isPrimary: z.boolean().optional().openapi({ example: false }),
  startTime: z.coerce.date().optional().openapi({
    example: "2026-04-23T00:00:00.000Z",
    description: "缺省则由后端写入 now()",
  }),
  description: z.string().max(500).nullable().optional(),
}).refine(dto => dto.orgCode !== undefined || dto.deptOrgCode !== undefined, {
  message: "orgCode 或 deptOrgCode 至少提供一个",
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
  newOrgCode: z.string().optional().openapi({ example: "SB01", description: "新的实际任职组织编码" }),
  expectedAncestorOrgCode: z.string().optional().openapi({
    example: "SB",
    description: "可选祖先组织校验；不入库",
  }),
  newCompanyOrgCode: z.string().optional().openapi({
    example: "SB",
    description: "Deprecated compatibility input. Used as expectedAncestorOrgCode when provided.",
    deprecated: true,
  }),
  newDeptOrgCode: z.string().optional().openapi({
    example: "SB01",
    description: "Deprecated compatibility input. Used as newOrgCode when newOrgCode is omitted.",
    deprecated: true,
  }),
  newPosCode: z.string().openapi({ example: "E034" }),
  startTime: z.coerce.date().optional().openapi({
    description: "新雇佣的 startTime；缺省 now()",
  }),
  inheritPrimary: z.boolean().optional().openapi({
    example: true,
    description: "是否继承原雇佣的 isPrimary；缺省 true",
  }),
  description: z.string().max(500).nullable().optional(),
}).refine(dto => dto.newOrgCode !== undefined || dto.newDeptOrgCode !== undefined, {
  message: "newOrgCode 或 newDeptOrgCode 至少提供一个",
}).openapi("EmploymentTransferDto");
