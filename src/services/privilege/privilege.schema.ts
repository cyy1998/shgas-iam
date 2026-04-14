import { z } from "@hono/zod-openapi";
import { PrivilegeSchema as PrismaPrivilegeSchema } from "@/db/generated/schemas";

export const PrivilegeDtoSchema = z.object(PrismaPrivilegeSchema.shape).openapi("PrivilegeDto");
