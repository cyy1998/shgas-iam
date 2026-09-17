import { z } from "@hono/zod-openapi";

export const MaskedMobileSchema = z.object({
  mobile: z.string().nullable().openapi({
    example: "138****1234",
    description: "脱敏手机号，仅用于展示",
  }),
}).openapi("MaskedMobile");
