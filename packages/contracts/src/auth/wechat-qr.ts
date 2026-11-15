import { z } from "zod";
import { ApiErrorCode } from "../enums/api-error-code";

export const WechatQrIdSchema = z.string().regex(/^[0-9a-f]{48}$/u);
export const WechatQrStatusSchema = z.enum(["waiting", "confirmed", "binding_required", "consumed", "restart"]);
export type WechatQrStatus = z.infer<typeof WechatQrStatusSchema>;

export const WechatQrStartResultSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("continue") }),
  z.object({
    decision: z.literal("scan"),
    requestId: WechatQrIdSchema,
    expiresAt: z.number().int(),
    mobileUrl: z.url({ protocol: /^https$/u }),
  }),
]);
export type WechatQrRequest = Extract<z.infer<typeof WechatQrStartResultSchema>, { decision: "scan" }>;

export const WechatQrStartResponseSchema = z.object({ data: WechatQrStartResultSchema });
export const WechatQrCompleteResponseSchema = z.object({
  data: z.object({ decision: z.enum(["continue", "restart", "pending"]) }),
});
export const WechatQrLoginFailureSchema = z.object({
  code: z.literal(ApiErrorCode.LoginFailed),
  message: z.string(),
});
export const WechatQrBindPasswordSchema = z.object({
  credential: z.string().min(1).max(8192),
  capToken: z.string().min(1).max(1024).optional(),
});

export const WechatQrSendSmsSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^1[3-9]\d{9}$/u),
  capToken: z.string().min(1).max(1024).optional(),
});
export const WechatQrBindSmsSchema = WechatQrSendSmsSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{4}$/u),
});
export const WechatQrSendSmsResponseSchema = z.object({
  data: z.object({ decision: z.enum(["sent", "restart", "pending"]) }),
});

export const WechatQrEventSchema = z.object({ status: WechatQrStatusSchema });
