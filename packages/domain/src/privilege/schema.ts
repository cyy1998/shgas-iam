import { z } from "@hono/zod-openapi";
import { selectPrivilegeSchema } from "@iam/db/schema";

export const PrivilegeDtoSchema = z.object(selectPrivilegeSchema.shape).required().openapi("PrivilegeDto");
