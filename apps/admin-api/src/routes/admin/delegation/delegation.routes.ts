import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { createAdminMutationResultSchema } from "@iam/contracts";
import { DelegationSearchSchema, DelegationUpdateSchema } from "@iam/delegation";
import {
  AdminDelegationCreateSchema,
  AdminDelegationVoSchema,
  DelegationClientOptionSchema,
  DelegationIdSchema,
  DelegationOrganizationOptionSchema,
  DelegationSelectorQuerySchema,
  DelegationUserOptionSchema,
} from "./delegation.schema";

const tags = ["Admin/Delegation"];
export const delegationSearch = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: { body: jsonContentRequired(DelegationSearchSchema, "委托查询") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(AdminDelegationVoSchema)), "委托列表"),
  },
});
export const delegationCreate = createRoute({
  method: "post",
  path: "/",
  tags,
  request: { body: jsonContentRequired(AdminDelegationCreateSchema, "创建委托") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createAdminMutationResultSchema(AdminDelegationVoSchema)),
      "创建结果",
    ),
  },
});
export const delegationUpdate = createRoute({
  method: "patch",
  path: "/{id}",
  tags,
  request: { params: DelegationIdSchema, body: jsonContentRequired(DelegationUpdateSchema, "修改委托") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(createAdminMutationResultSchema(z.null())),
      "修改结果",
    ),
  },
});
export const delegationUsers = createRoute({
  method: "post",
  path: "/selectors/users",
  tags,
  request: { body: jsonContentRequired(DelegationSelectorQuerySchema, "用户选择") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(DelegationUserOptionSchema)),
      "创建或管理筛选用户",
    ),
  },
});
export const delegationClients = createRoute({
  method: "post",
  path: "/selectors/clients",
  tags,
  request: { body: jsonContentRequired(DelegationSelectorQuerySchema, "应用选择") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(DelegationClientOptionSchema)),
      "创建或管理筛选应用",
    ),
  },
});
export const delegationOrganizations = createRoute({
  method: "post",
  path: "/selectors/organizations",
  tags,
  request: { body: jsonContentRequired(DelegationSelectorQuerySchema, "组织选择") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(DelegationOrganizationOptionSchema)),
      "创建或管理筛选组织",
    ),
  },
});
