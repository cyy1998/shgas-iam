import type { z } from "@hono/zod-openapi";
import type { PrivilegeQueryDtoSchema } from "./privilege.schema";

export interface PrivilegeQueryDto extends z.infer<typeof PrivilegeQueryDtoSchema> {};
