import type { z } from "@hono/zod-openapi";
import type { ClientDtoSchema, ClientExtAttributesDtoSchema, ClientInputDtoSchema } from "./client.schema";

export type ClientExtAttributesDto = z.infer<typeof ClientExtAttributesDtoSchema>;
export type ClientDto = z.infer<typeof ClientDtoSchema>;
export type ClientInputDto = z.infer<typeof ClientInputDtoSchema>;
