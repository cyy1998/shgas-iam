import { z } from "@hono/zod-openapi";
import { ClientManagementLevel } from "@/enums/client.managementLevel";

export const LocalSessionAbstractSchema = z.object({
  clientCode: z.string(),
  localSessionId: z.string(),
  mode: z.enum(ClientManagementLevel),
}).openapi("LocalSessionAbstractSchema");

export const SessionObjectSchema = z.object({
  sessionId: z.string(),
  data: z.string(),
}).openapi("SessionObject");
