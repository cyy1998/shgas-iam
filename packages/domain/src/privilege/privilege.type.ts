import type { z } from "@hono/zod-openapi";
import type { PrivilegeDtoSchema } from "./schema";

export type PrivilegeDto = z.infer<typeof PrivilegeDtoSchema>;
