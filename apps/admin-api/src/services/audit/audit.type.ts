import type { z } from "@hono/zod-openapi";
import type { AuditLogPaginationQueryDtoSchema } from "./audit.schema";

export type AuditLogPaginationQueryDto = z.infer<typeof AuditLogPaginationQueryDtoSchema>;
