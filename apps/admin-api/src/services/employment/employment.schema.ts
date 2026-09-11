import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { EmploymentStatus, OrganizationType } from "@iam/contracts";
import { EmploymentDetailDtoSchema as SharedEmploymentDetailDtoSchema } from "@iam/domain/employment";

export const EmploymentDetailDtoSchema = SharedEmploymentDetailDtoSchema.pick({
  id: true,
  userId: true,
  orgId: true,
  posId: true,
  isPrimary: true,
  status: true,
  startTime: true,
  endTime: true,
  description: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
  user: true,
  position: true,
  organization: true,
  roles: true,
  privileges: true,
}).extend({
  roleNames: z.record(z.string(), z.string()).default({}),
  privilegeNames: z.record(z.string(), z.string()).default({}),
});

export {
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
        description: "未传时全局管理员返回全部状态，范围管理员由服务端默认限定为 [Enable, Pause]；显式传入可查询已结束历史",
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
  description: z.string().max(500).nullable().optional(),
}).refine(dto => dto.orgCode !== undefined || dto.deptOrgCode !== undefined, {
  message: "orgCode 或 deptOrgCode 至少提供一个",
}).openapi("EmploymentAdminCreateDto");

export const EmploymentUpdateDtoSchema = z.object({
  description: z.string().max(500).nullable().optional(),
}).strict().refine(dto => dto.description !== undefined, {
  message: "至少提交一个任职更新字段",
}).openapi("EmploymentUpdateDto");

export const EmploymentResumeDtoSchema = z.object({
  expectedAncestorOrgCode: z.string().openapi({
    example: "SR",
    description: "祖先组织范围复核；不入库",
  }),
}).openapi("EmploymentResumeDto");

export const EmploymentTransferDtoSchema = z.object({
  newOrgCode: z.string().openapi({ example: "SB01", description: "新的实际任职组织编码" }),
  expectedAncestorOrgCode: z.string().optional().openapi({
    example: "SB",
    description: "可选祖先组织校验；不入库",
  }),
  newPosCode: z.string().openapi({ example: "E034" }),
  isPrimary: z.boolean().openapi({
    example: false,
    description: "新任职是否为主任职；必须由管理员明确选择",
  }),
  description: z.string().max(500).nullable().optional(),
}).strict().openapi("EmploymentTransferDto");
