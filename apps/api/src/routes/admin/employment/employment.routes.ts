import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@/lib/core/pagination/schema";
import { EmploymentDetailVoSchema, EmploymentVoSchema } from "@/routes/admin/employment/employment.schema";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentStatusUpdateDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@/services/employment/employment.schema";

const tags = ["Admin/Employment"];

export const employmentsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(EmploymentAdminPaginationQueryDtoSchema, "雇佣关系分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createPageResultSchema(z.array(EmploymentVoSchema))),
      "分页雇佣列表",
    ),
  },
});

export const employmentsDetail = createRoute({
  method: "get",
  path: "/:id",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(EmploymentDetailVoSchema),
      "雇佣详情（含 roles/privileges 聚合）",
    ),
  },
});

export const employmentsCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(EmploymentAdminCreateDtoSchema, "新增雇佣参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.object({ id: z.number() })),
      "雇佣创建成功",
    ),
  },
});

export const employmentsUpdate = createRoute({
  method: "put",
  path: "/:id",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: jsonContentRequired(EmploymentUpdateDtoSchema, "雇佣更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "更新成功"),
  },
});

export const employmentsStatusUpdate = createRoute({
  method: "patch",
  path: "/:id/status",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: jsonContentRequired(EmploymentStatusUpdateDtoSchema, "雇佣状态变更（status=Disable 时自动写 endTime=now）"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
  },
});

export const employmentsDelete = createRoute({
  method: "delete",
  path: "/:id",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "软删除成功"),
  },
});

export const employmentsTransfer = createRoute({
  method: "post",
  path: "/:id/transfer",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: jsonContentRequired(EmploymentTransferDtoSchema, "转岗参数（原子事务：结束旧 + 建新）"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.object({ newEmploymentId: z.number() })),
      "转岗成功",
    ),
  },
});

export const employmentsSetPrimary = createRoute({
  method: "post",
  path: "/:id/set-primary",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "已设为主岗"),
  },
});

export const employmentsResignUser = createRoute({
  method: "post",
  path: "/users/:username/resign",
  tags,
  request: {
    params: z.object({ username: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.boolean()),
      "离职成功（级联结束全部雇佣 + User.status=Disable）",
    ),
  },
});
