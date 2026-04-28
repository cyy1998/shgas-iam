import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@/lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";

const routePrefix = "";
const tags = ["Auth"];

export const loginPassword = createRoute({
  method: "post",
  path: `${routePrefix}/login/password`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      username: z.string().openapi({ example: "138550" }),
      password: z.string().openapi({ example: "1234" }),
    }), "用户名密码登录参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        z.object({
          token: z.string().openapi({ example: "ed5776f0-5d5d-44a7-b44b-9505f5799a12" }),
          isMobileSet: z.boolean(),
        }),
      ),
      "登录成功",
    ),
  },
});

export const loginMobile = createRoute({
  method: "post",
  path: `${routePrefix}/login/mobile`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      phoneNumber: z.string().openapi({ example: "17721462865" }),
      code: z.string().openapi({ example: "1234" }),
    }), "手机登录参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        z.object({
          token: z.string().openapi({ example: "ed5776f0-5d5d-44a7-b44b-9505f5799a12" }),
          isMobileSet: z.boolean(),
        }),
      ),
      "登录成功",
    ),
  },
});

export const authz = createRoute({
  method: "get",
  path: `${routePrefix}/authz`,
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.object()), "准许"),
  },
});

export const internalAuthz = createRoute({
  method: "get",
  path: `${routePrefix}/internal-authz`,
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.object()), "准许"),
  },
});
