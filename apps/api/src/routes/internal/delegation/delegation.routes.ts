import { PrivilegeDelegationCreateDtoSchema, PrivilegeDelegationDetailDtoSchema, PrivilegeDelegationQueryDtoSchema, PrivilegeDelegationUpdateDtoSchema } from "@api/services/privilege/privilegeDelegation.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";

const tags = ["Internal/Delegation"];

export const privilegeDelegationsQuery = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(PrivilegeDelegationQueryDtoSchema, "权限代理搜索参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(PrivilegeDelegationDetailDtoSchema)), "权限Delegation列表"),
  },
});

export const privilegeDelegationUpdate = createRoute({
  method: "patch",
  path: "/:id",
  tags,
  request: {
    params: z.object({
      id: z.coerce.number().int().openapi({ example: 1 }),
    }),
    body: jsonContentRequired(PrivilegeDelegationUpdateDtoSchema, "权限Delegation更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "权限Delegation更新结果"),
  },
});

export const privilegeDelegationSet = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(PrivilegeDelegationCreateDtoSchema, "权限Delegation设置参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(PrivilegeDelegationDetailDtoSchema), "权限Delegation设置结果"),
  },
});
