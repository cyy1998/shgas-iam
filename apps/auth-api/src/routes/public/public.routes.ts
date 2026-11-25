import { CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME } from "@auth-api/services/sso/transport/custom-sso-delivery.security";
import { CustomSsoDeliveryRequestHeadersSchema } from "@auth-api/services/sso/transport/custom-sso-delivery-request.schema";
import { createRoute, z } from "@hono/zod-openapi";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { HttpStatusCodes } from "@iam/contracts/http";

const routePrefix = "";
const tags = ["Account"];

export const passwordChange = createRoute({
  method: "post",
  path: `${routePrefix}/password`,
  tags,
  security: [{ [CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME]: [] }],
  description: "Requires the encoded Client header and a valid global or Custom SSO session.",
  request: {
    headers: CustomSsoDeliveryRequestHeadersSchema,
    body: jsonContentRequired(
      z.object({
        oldPassword: z.string().openapi({ example: "1234" }),
        newPassword: z.string().openapi({ example: "1234" }),
      }),
      "更换密码请求参数",
    ),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "密码更换成功"),
  },
});

export const mobileSet = createRoute({
  method: "post",
  path: `${routePrefix}/mobile`,
  tags,
  security: [{ [CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME]: [] }],
  description: "Requires the encoded Client header and a valid global or Custom SSO session.",
  request: {
    headers: CustomSsoDeliveryRequestHeadersSchema,
    body: jsonContentRequired(
      z.object({
        phoneNumber: z.string().openapi({ example: "17721462865" }),
        code: z.string().openapi({ example: "1234" }),
      }),
      "移动电话设置请求参数",
    ),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "移动电话设置成功"),
  },
});
