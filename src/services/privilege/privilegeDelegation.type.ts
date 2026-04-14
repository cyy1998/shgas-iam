import type { z } from "@hono/zod-openapi";
import type { PrivilegeDelegationCreateDtoSchema, PrivilegeDelegationQueryDtoSchema } from "./privilegeDelegation.schema";

export interface PrivilegeDelegationQueryDto extends z.infer<typeof PrivilegeDelegationQueryDtoSchema> {}
export interface PrivilegeDelegationCreateDto extends z.infer<typeof PrivilegeDelegationCreateDtoSchema> {}
