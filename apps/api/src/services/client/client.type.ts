import type { z } from "@hono/zod-openapi";
import type { ClientDtoSchema } from "./client.schema";

export interface ClientDto extends z.infer<typeof ClientDtoSchema> {};
