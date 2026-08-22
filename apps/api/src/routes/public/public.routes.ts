import { OrganizationDtoSchema, OrganizationQueryDtoSchema } from "@api/services/organization/organization.schema";
import {
  CustomSsoDeliveryRequestHeadersSchema,
} from "@api/services/sso/custom-sso-delivery-request.schema";
import {
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
} from "@api/services/sso/custom-sso-delivery.security";
import {
  createCustomSsoUnavailableResponse,
} from "@api/services/sso/custom-sso-retryable.openapi";
import {
  CustomSsoSubjectProjectionV2Schema,
} from "@api/services/sso/custom-sso-subject.schema";
import { UserDtoSchema, UserQueryDtoSchema } from "@api/services/user/user.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";

const routePrefix = "";
const tags = ["Public"];

const OrcasIdDtoSchema = z.object({
  orcasId: z.string().nullable().openapi({ example: "ada8wf89w83b2" }),
}).openapi("PublicOrcasIdDto");

export const userInfo = createRoute({
  method: "get",
  path: `${routePrefix}/user-info`,
  tags,
  description:
    "Requires the encoded Client header and an authenticated session. OpenAPI clients use the raw session ID through the Authorization security scheme; browser calls may instead use global_session for Client=iam or the IAM-managed local_{encodedClientCode}_session cookie for other clients.",
  security: [
    { [CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME]: [] },
  ],
  request: {
    headers: CustomSsoDeliveryRequestHeadersSchema,
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(CustomSsoSubjectProjectionV2Schema),
      "当前 Custom SSO Client 可见的主体投影",
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: createCustomSsoUnavailableResponse(
      "Subject Access 或 Client Subject Projection 暂时不可用",
    ),
  },
});

export const orcasId = createRoute({
  method: "get",
  path: `${routePrefix}/orcasId`,
  tags,
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(OrcasIdDtoSchema), "本 Custom SSO Session 的 Orcas ID"),
  },
});

export const passwordChange = createRoute({
  method: "post",
  path: `${routePrefix}/password/change`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      oldPassword: z.string().openapi({ example: "1234" }),
      newPassword: z.string().openapi({ example: "1234" }),
    }), "更换密码请求参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "密码更换成功"),
  },
});

export const mobileSet = createRoute({
  method: "post",
  path: `${routePrefix}/mobile/set`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      phoneNumber: z.string().openapi({ example: "17721462865" }),
      code: z.string().openapi({ example: "1234" }),
    }), "移动电话设置请求参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "移动电话设置成功"),
  },
});

export const organizationsSearch = createRoute({
  method: "post",
  path: `${routePrefix}/organizations/search`,
  tags,
  request: {
    body: jsonContentRequired(OrganizationQueryDtoSchema, "组织查询请求参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationDtoSchema)), "组织查询结果"),
  },
});

export const usersSearch = createRoute({
  method: "post",
  path: `${routePrefix}/users/search`,
  tags,
  request: {
    body: jsonContentRequired(UserQueryDtoSchema, "用户查询参数"),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户查询结果"),
  },
});
