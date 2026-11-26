import { createRoute, z } from "@hono/zod-openapi";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import { ClientCodeSchema } from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";

const routePrefix = "";
const tags = ["SSO"];
const CustomSsoClientCodeSchema = ClientCodeSchema.meta({
  description: "Client Code",
  example: "tender",
});

export const loginOA = createRoute({
  method: "get",
  path: `${routePrefix}/thirdparty/{clientCode}`,
  tags,
  request: {
    params: z.object({
      clientCode: CustomSsoClientCodeSchema.openapi({ example: "oa" }),
    }),
    query: z.object({
      ssoReturn: z
        .string()
        .regex(/^[\w-]{43}$/u)
        .optional(),
      loginid: z.string().openapi({ example: "138550" }),
      ts: z.string().openapi({ example: "1234" }),
      token: z.string().openapi({ example: "138550" }),
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      client: CustomSsoClientCodeSchema,
      state: z.string().optional().openapi({ example: "opaque-client-state" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "OA登录成功",
    },
  },
});

export const loginWX = createRoute({
  method: "get",
  path: `${routePrefix}/third-party/wx`,
  tags,
  request: {
    query: z.object({
      ssoReturn: z
        .string()
        .regex(/^[\w-]{43}$/u)
        .optional(),
      code: z.string().openapi({ example: "1234" }),
      redirectUrl: z.url().openapi({ example: "http://localhost:8080" }),
      client: CustomSsoClientCodeSchema,
      state: z.string().optional().openapi({ example: "opaque-client-state" }),
    }),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.MOVED_TEMPORARILY]: {
      description: "微信登录成功",
    },
  },
});
