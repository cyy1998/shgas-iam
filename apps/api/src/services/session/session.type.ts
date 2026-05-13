import type { z } from "@hono/zod-openapi";
import type { LocalSessionAbstractSchema } from "./session.schema";

export type LocalSessionAbstract = z.infer<typeof LocalSessionAbstractSchema>;
