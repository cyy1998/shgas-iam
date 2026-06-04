import type { z } from "@hono/zod-openapi";
import type { ClientDtoSchema } from "./schema";

export type ClientDto = z.infer<typeof ClientDtoSchema>;
