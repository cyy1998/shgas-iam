import type { z } from "@hono/zod-openapi";
import type { ClientDtoSchema, ClientExtAttributesDtoSchema, ClientInputDtoSchema } from "./client.schema";

export interface ClientExtAttributesDto extends z.infer<typeof ClientExtAttributesDtoSchema> {};
export interface ClientDto extends z.infer<typeof ClientDtoSchema> {};
export interface ClientInputDto extends z.infer<typeof ClientInputDtoSchema> {};
