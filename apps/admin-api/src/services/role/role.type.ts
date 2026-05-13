import type { z } from "@hono/zod-openapi";
import type { RoleDtoSchema } from "./role.schema";

export type RoleDto = z.infer<typeof RoleDtoSchema>;
