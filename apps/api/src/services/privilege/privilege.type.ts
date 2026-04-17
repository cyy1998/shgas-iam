import type { z } from "@hono/zod-openapi";
import type { PrivilegeDtoSchema, PrivilegeQueryDtoSchema } from "./privilege.schema";

export interface PrivilegeDto extends z.infer<typeof PrivilegeDtoSchema> {};
export interface PrivilegeQueryDto extends z.infer<typeof PrivilegeQueryDtoSchema> {};
