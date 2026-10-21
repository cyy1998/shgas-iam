import {
  PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
  PRIVILEGE_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE,
} from "@api/use-cases/internal/resolve-privilege-delegations/resolve-privilege-delegations.error";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { ApiErrorCode } from "@iam/contracts";
import {
  DelegationCreateSchema,
  DelegationDetailSchema,
  DelegationResolveSchema,
  DelegationSearchSchema,
  DelegationUpdateSchema,
} from "@iam/delegation/wire";

const tags = ["Internal/Delegation"];

const PrivilegeDelegationResolutionRequestSchema = DelegationResolveSchema.openapi("DelegationResolutionRequest");
const PrivilegeDelegationCreateDtoSchema = DelegationCreateSchema.omit({ clientId: true })
  .required({ delegatorUsername: true })
  .openapi("DelegationCreateDto");
const PrivilegeDelegationUpdateDtoSchema = DelegationUpdateSchema.openapi("DelegationUpdateDto");
const PrivilegeDelegationQueryDtoSchema = DelegationSearchSchema.omit({ clientIds: true }).openapi(
  "DelegationQueryDto",
);
const PrivilegeDelegationDetailDtoSchema = DelegationDetailSchema.openapi("DelegationDetailDto");

const PrivilegeDelegationResolutionResultSchema = z
  .object({
    username: z.string().openapi({ example: "alice" }),
    delegateeUsername: z.string().nullable().openapi({ example: "bob" }),
  })
  .strict()
  .openapi("PrivilegeDelegationResolutionResult");

const PrivilegeDelegationResolutionInputNotFoundResponseSchema = z
  .object({
    code: z.literal(ApiErrorCode.PrivilegeDelegationResolutionInputNotFound),
    data: z
      .object({
        usernames: z.array(z.string()),
        orgCodes: z.array(z.string()),
      })
      .strict(),
    message: z.string().openapi({
      example: PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
    }),
  })
  .strict()
  .openapi("PrivilegeDelegationResolutionInputNotFoundResponse");

const PrivilegeDelegationResolutionUnavailableResponseSchema = z
  .object({
    code: z.literal(ApiErrorCode.PrivilegeDelegationResolutionUnavailable),
    data: z.null(),
    message: z.string().openapi({
      example: PRIVILEGE_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE,
    }),
  })
  .strict()
  .openapi("PrivilegeDelegationResolutionUnavailableResponse");

export const privilegeDelegationsResolve = createRoute({
  method: "post",
  path: "/resolve",
  tags,
  request: {
    body: jsonContentRequired(PrivilegeDelegationResolutionRequestSchema, "当前直接应用委托解析参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      PrivilegeDelegationResolutionInputNotFoundResponseSchema,
      PRIVILEGE_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      PrivilegeDelegationResolutionUnavailableResponseSchema,
      PRIVILEGE_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE,
    ),
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(PrivilegeDelegationResolutionResultSchema)),
      "按输入顺序返回当前直接被委托人",
    ),
  },
});

export const privilegeDelegationsQuery = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(PrivilegeDelegationQueryDtoSchema, "应用代理搜索参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(PrivilegeDelegationDetailDtoSchema)),
      "应用Delegation列表",
    ),
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
    body: jsonContentRequired(PrivilegeDelegationUpdateDtoSchema, "应用Delegation更新参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "应用Delegation更新结果"),
  },
});

export const privilegeDelegationSet = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(PrivilegeDelegationCreateDtoSchema, "应用Delegation设置参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(PrivilegeDelegationDetailDtoSchema),
      "应用Delegation设置结果",
    ),
  },
});
