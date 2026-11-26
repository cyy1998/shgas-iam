import { Buffer } from "node:buffer";
import { z } from "zod";

export const wechatOpenIdSchema = z
  .string()
  .min(1)
  .refine((value) => value === value.trim() && Buffer.byteLength(value, "utf8") <= 64);

export const wechatExternalIdentitySchema = z.object({ corpId: z.string().min(1), openId: wechatOpenIdSchema });
export type WechatExternalIdentity = z.infer<typeof wechatExternalIdentitySchema>;

export type WechatQrIdentity = { kind: "member"; wxId: string } | ({ kind: "external" } & WechatExternalIdentity);
