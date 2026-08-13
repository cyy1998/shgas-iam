import { EmploymentDetailVoSchema, EmploymentVoSchema } from "@admin-api/routes/admin/employment/employment.schema";
import {
  EmploymentAdminCreateDtoSchema,
  EmploymentAdminPaginationQueryDtoSchema,
  EmploymentResumeDtoSchema,
  EmploymentTransferDtoSchema,
  EmploymentUpdateDtoSchema,
} from "@admin-api/services/employment/employment.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { createPageResultSchema } from "@iam/api-core/core/pagination/schema";

const tags = ["Admin/Employment"];

export const employmentsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(EmploymentAdminPaginationQueryDtoSchema, "雇佣关系分页查询参数"),
  },
  responses: {
    ...commonErrorResponses,
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
    ...commonErrorResponses,
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
    ...commonErrorResponses,
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
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "更新成功"),
  },
});

export const employmentsPause = createRoute({
  method: "post",
  path: "/:id/pause",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "任职暂停成功"),
  },
});

export const employmentsResume = createRoute({
  method: "post",
  path: "/:id/resume",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: jsonContentRequired(EmploymentResumeDtoSchema, "任职恢复参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "任职恢复成功"),
  },
});

export const employmentsEnd = createRoute({
  method: "post",
  path: "/:id/end",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "任职结束成功"),
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
    ...commonErrorResponses,
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
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "已设为主岗"),
  },
});

export const employmentsClearPrimary = createRoute({
  method: "post",
  path: "/:id/clear-primary",
  tags,
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "已取消主任职"),
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
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.boolean()),
      "离职成功（级联结束全部雇佣 + User.status=Disable）",
    ),
  },
});
