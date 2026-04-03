import type { z } from "@hono/zod-openapi";
import type { PaginationQuerySchema } from "./schema";

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
