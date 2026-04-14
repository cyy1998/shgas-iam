import type { z } from "@hono/zod-openapi";
import type { PrivilegeDtoSchema } from "./privilege.schema";

export interface PrivilegeDto extends z.infer<typeof PrivilegeDtoSchema> {};
