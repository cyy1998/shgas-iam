import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { EmploymentStatus } from "@iam/contracts";

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
