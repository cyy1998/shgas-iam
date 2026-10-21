import {
  CLIENT_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
  CLIENT_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE,
} from "@api/use-cases/internal/resolve-client-delegations/resolve-client-delegations.error";
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

const ClientDelegationResolutionRequestSchema = DelegationResolveSchema.openapi("DelegationResolutionRequest");
const ClientDelegationCreateDtoSchema = DelegationCreateSchema.omit({ clientId: true })
  .required({ delegatorUsername: true })
  .openapi("DelegationCreateDto");
const ClientDelegationUpdateDtoSchema = DelegationUpdateSchema.openapi("DelegationUpdateDto");
const ClientDelegationQueryDtoSchema = DelegationSearchSchema.omit({ clientIds: true }).openapi("DelegationQueryDto");
const ClientDelegationDetailDtoSchema = DelegationDetailSchema.openapi("DelegationDetailDto");

const ClientDelegationResolutionResultSchema = z
  .object({
    username: z.string().openapi({ example: "alice" }),
    delegateeUsername: z.string().nullable().openapi({ example: "bob" }),
  })
  .strict()
  .openapi("ClientDelegationResolutionResult");

const ClientDelegationResolutionInputNotFoundResponseSchema = z
  .object({
    code: z.literal(ApiErrorCode.ClientDelegationResolutionInputNotFound),
    data: z
      .object({
        usernames: z.array(z.string()),
        orgCodes: z.array(z.string()),
      })
      .strict(),
    message: z.string().openapi({
      example: CLIENT_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
    }),
  })
  .strict()
  .openapi("ClientDelegationResolutionInputNotFoundResponse");

const ClientDelegationResolutionUnavailableResponseSchema = z
  .object({
    code: z.literal(ApiErrorCode.ClientDelegationResolutionUnavailable),
    data: z.null(),
    message: z.string().openapi({
      example: CLIENT_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE,
    }),
  })
  .strict()
  .openapi("ClientDelegationResolutionUnavailableResponse");

export const clientDelegationsResolve = createRoute({
  method: "post",
  path: "/resolve",
  tags,
  request: {
    body: jsonContentRequired(ClientDelegationResolutionRequestSchema, "当前直接应用委托解析参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      ClientDelegationResolutionInputNotFoundResponseSchema,
      CLIENT_DELEGATION_RESOLUTION_INPUT_NOT_FOUND_MESSAGE,
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      ClientDelegationResolutionUnavailableResponseSchema,
      CLIENT_DELEGATION_RESOLUTION_UNAVAILABLE_MESSAGE,
    ),
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(ClientDelegationResolutionResultSchema)),
      "按输入顺序返回当前直接被委托人",
    ),
  },
});

export const clientDelegationsQuery = createRoute({
  method: "post",
  path: "/search",
  tags,
  request: {
    body: jsonContentRequired(ClientDelegationQueryDtoSchema, "应用代理搜索参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.array(ClientDelegationDetailDtoSchema)),
      "应用Delegation列表",
    ),
  },
});

export const clientDelegationUpdate = createRoute({
  method: "patch",
  path: "/:id",
  tags,
  request: {
    params: z.object({
      id: z.coerce.number().int().openapi({ example: 1 }),
    }),
    body: jsonContentRequired(ClientDelegationUpdateDtoSchema, "应用Delegation更新参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "应用Delegation更新结果"),
  },
});

export const clientDelegationSet = createRoute({
  method: "post",
  path: "/",
  tags,
  request: {
    body: jsonContentRequired(ClientDelegationCreateDtoSchema, "应用Delegation设置参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(ClientDelegationDetailDtoSchema),
      "应用Delegation设置结果",
    ),
  },
});
