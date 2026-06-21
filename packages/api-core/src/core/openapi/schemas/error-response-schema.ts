import { z } from "@hono/zod-openapi";
import { ApiErrorCode } from "@iam/contracts";

export const StandardErrorResponseSchema = z.object({
  code: z.string().openapi({ example: ApiErrorCode.BadRequest }),
  data: z.null(),
  message: z.string().openapi({ example: "请求失败" }),
});

export const ValidationIssueSchema = z.object({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
}).passthrough();

export const ValidationFailureResponseSchema = z.object({
  code: z.literal(ApiErrorCode.ValidationFailed),
  data: z.object({
    requestId: z.string().optional(),
    issues: z.array(ValidationIssueSchema),
  }),
  message: z.literal("请求参数不合法"),
});

export const InternalErrorResponseSchema = z.object({
  code: z.literal(ApiErrorCode.InternalError),
  data: z.object({
    requestId: z.string().optional(),
  }),
  message: z.string().openapi({ example: "服务器内部错误，请联系管理员并提供 requestId" }),
});
