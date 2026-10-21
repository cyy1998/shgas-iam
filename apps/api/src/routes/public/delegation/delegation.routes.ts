import { CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME } from "@api/services/sso/transport/custom-sso-delivery.security";
import { CustomSsoDeliveryRequestHeadersSchema } from "@api/services/sso/transport/custom-sso-delivery-request.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import {
  DelegationCreateSchema,
  DelegationDetailSchema,
  DelegationSearchSchema,
  DelegationUpdateSchema,
} from "@iam/delegation/wire";

const createInput = DelegationCreateSchema.omit({ delegatorUsername: true }).required({ clientId: true });
const searchInput = DelegationSearchSchema.extend({ direction: z.enum(["outgoing", "incoming"]).default("outgoing") });
const tags = ["Personal Delegation"];
const security = [{ [CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME]: [] }];
export const create = createRoute({
  method: "post",
  path: "/delegations",
  tags,
  security,
  request: { headers: CustomSsoDeliveryRequestHeadersSchema, body: jsonContentRequired(createInput, "创建本人委托") },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.object({ changed: z.boolean(), result: DelegationDetailSchema })),
      "本人委托",
    ),
  },
});
export const search = createRoute({
  method: "post",
  path: "/delegations/search",
  tags,
  security,
  request: {
    headers: CustomSsoDeliveryRequestHeadersSchema,
    body: jsonContentRequired(searchInput, "查询本人发起或收到的委托"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(DelegationDetailSchema)), "本人委托列表"),
  },
});
export const update = createRoute({
  method: "patch",
  path: "/delegations/{id}",
  tags,
  security,
  request: {
    headers: CustomSsoDeliveryRequestHeadersSchema,
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: jsonContentRequired(DelegationUpdateSchema, "修改本人委托期间、说明或状态"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(z.object({ changed: z.boolean(), result: DelegationDetailSchema })),
      "本人委托修改结果",
    ),
  },
});
const choiceQuery = z.object({ search: z.string().max(128).optional() }).strict();
function choiceRoute<const Path extends string, Schema extends z.ZodType>(path: Path, schema: Schema) {
  return createRoute({
    method: "get",
    path,
    tags,
    security,
    request: { headers: CustomSsoDeliveryRequestHeadersSchema, query: choiceQuery },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(schema)), "启用的可选对象安全摘要"),
    },
  });
}
export const userChoices = choiceRoute(
  "/delegations/choices/users",
  z.object({ id: z.number(), username: z.string(), name: z.string() }),
);
export const clientChoices = choiceRoute(
  "/delegations/choices/clients",
  z.object({ id: z.number(), clientCode: z.string(), clientName: z.string() }),
);
export const organizationChoices = choiceRoute(
  "/delegations/choices/organizations",
  z.object({ id: z.number(), orgCode: z.string(), orgName: z.string() }),
);
