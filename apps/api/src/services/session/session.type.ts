import type { z } from "@hono/zod-openapi";
import type { LocalSessionAbstractSchema, SessionObjectSchema } from "./session.schema";

export type LocalSessionAbstract = z.infer<typeof LocalSessionAbstractSchema>;
export type SessionObject = z.infer<typeof SessionObjectSchema>;
