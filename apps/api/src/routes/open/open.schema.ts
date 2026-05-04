import { z } from "@hono/zod-openapi";

export const OpenUserInfoSchema = z.object({
  username: z.string().openapi({ example: "zhangsan" }),
  name: z.string().openapi({ example: "张三" }),
  mobile: z.string().nullable().openapi({
    example: "138****1234",
    description: "脱敏手机号，仅用于展示",
  }),
}).openapi("OpenUserInfo");
