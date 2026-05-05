import { ClientManagementLevel } from "@api/enums/client.managementLevel";
import { z } from "@hono/zod-openapi";

export const LocalSessionAbstractSchema = z.object({
  clientCode: z.string(),
  localSessionId: z.string(),
  mode: z.enum(ClientManagementLevel),
}).openapi("LocalSessionAbstractSchema");

export const SessionObjectSchema = z.object({
  sessionId: z.string(),
  data: z.string(),
}).openapi("SessionObject");
