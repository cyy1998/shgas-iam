import {
  PositionCreateDtoSchema,
  PositionDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionStatusUpdateDtoSchema,
  PositionUpdateDtoSchema,
} from "@api/services/position/position.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { PositionVoSchema } from "./position.schema";

const tags = ["Admin/Position"];

export const positionsSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(PositionPaginationQueryDtoSchema, "岗位分页查询参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(PositionVoSchema)), "符合条件岗位列表"),
  },
});

export const positionDetail = createRoute({
  method: "get",
  path: "/:posCode",
  tags,
  request: {
    params: z.object({ posCode: z.string().openapi({ example: "E001" }) }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(PositionDtoSchema), "岗位详情"),
  },
});

export const positionCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(PositionCreateDtoSchema, "岗位创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "岗位创建成功"),
  },
});

export const positionUpdate = createRoute({
  method: "put",
  path: "/:posCode",
  tags,
  request: {
    params: z.object({ posCode: z.string() }),
    body: jsonContentRequired(PositionUpdateDtoSchema, "岗位更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "岗位更新成功"),
  },
});

export const positionStatusUpdate = createRoute({
  method: "patch",
  path: "/:posCode/status",
  tags,
  request: {
    params: z.object({ posCode: z.string() }),
    body: jsonContentRequired(PositionStatusUpdateDtoSchema, "岗位状态变更"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "状态更新成功"),
  },
});

export const positionDelete = createRoute({
  method: "delete",
  path: "/:posCode",
  tags,
  request: {
    params: z.object({ posCode: z.string() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "岗位删除成功"),
  },
});
