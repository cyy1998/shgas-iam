import { createRoute, z } from "@hono/zod-openapi";
import { VerificationCodeUsage } from "@/enums/verificationCode.usage";
import * as HttpStatusCodes from "@/lib/core/http-status-codes";
import jsonContent from "@/lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@/lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@/lib/core/openapi/schemas/create-success-schema";
import { ClientDtoSchema } from "@/services/client/client.schema";
import { OpenUserInfoSchema } from "./open.schema";

const routePrefix = "";
const tags = ["Open"];

export const clientStatus = createRoute({
  method: "get",
  path: `${routePrefix}/client/status`,
  tags,
  request: {
    query: z.object({
      clientCode: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(ClientDtoSchema), "应用信息"),
  },
});

export const userInfo = createRoute({
  method: "get",
  path: `${routePrefix}/users/userInfo`,
  tags,
  request: {
    query: z.object({
      username: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(OpenUserInfoSchema), "用户脱敏信息"),
  },
});

export const codeSend = createRoute({
  method: "post",
  path: `${routePrefix}/code/send`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      phoneNumber: z.string().optional().openapi({ example: "138****1234" }),
      username: z.string().optional().openapi({ example: "zhangsan" }),
      usage: z.enum(Object.values(VerificationCodeUsage)).openapi({ example: "login" }),
    }), "发送短信验证码参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "短信发送结果"),
  },
});

export const codeVerify = createRoute({
  method: "post",
  path: `${routePrefix}/code/verify`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      phoneNumber: z.string().optional().openapi({ example: "138****1234" }),
      username: z.string().optional().openapi({ example: "zhangsan" }),
      usage: z.enum(Object.values(VerificationCodeUsage)).openapi({ example: "login" }),
      code: z.string().openapi({ example: "1234" }),
    }), "验证短信验证码参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.object({ result: z.boolean() })), "短信验证结果"),
  },
});

export const passwordReset = createRoute({
  method: "post",
  path: `${routePrefix}/password/reset`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      username: z.string().openapi({ example: "138550" }),
      phoneNumber: z.string().optional().openapi({ example: "177****2865" }),
      code: z.string().openapi({ example: "1234" }),
      newPassword: z.string().openapi({ example: "abcd1234" }),
    }), "重置密码参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "密码重置结果"),
  },
});
