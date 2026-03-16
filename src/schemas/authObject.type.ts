import { z } from "@hono/zod-openapi";

export const AuthObjectSchema = z.object({
  sessionId: z.string(),
  data: z.string(),
}).openapi("AuthObject");

export type AuthObject = z.infer<typeof AuthObjectSchema>;
