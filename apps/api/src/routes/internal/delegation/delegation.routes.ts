import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@lib/core/openapi/schemas/create-success-schema";
import { PrivilegeDelegationCreateDtoSchema, PrivilegeDelegationDetailDtoSchema, PrivilegeDelegationQueryDtoSchema, PrivilegeDelegationUpdateDtoSchema } from "@/services/privilege/privilegeDelegation.schema";

const tags = ["Internal"];

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
