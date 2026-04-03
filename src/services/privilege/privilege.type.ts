import type { z } from "@hono/zod-openapi";
import type { PrivilegeDtoSchema } from "./privilege.schema";

export type PrivilegeDto = z.infer<typeof PrivilegeDtoSchema>;
