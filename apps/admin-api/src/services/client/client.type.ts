import type { z } from "@hono/zod-openapi";
import type { ClientCreateDtoSchema, ClientDtoSchema, ClientInputDtoSchema } from "./client.schema";

export interface ClientDto extends z.infer<typeof ClientDtoSchema> {};
export interface ClientInputDto extends z.infer<typeof ClientInputDtoSchema> {};
export interface ClientCreateDto extends z.infer<typeof ClientCreateDtoSchema> {};
