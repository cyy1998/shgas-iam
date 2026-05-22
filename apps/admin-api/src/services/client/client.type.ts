import type { z } from "@hono/zod-openapi";
import type {
  ClientCreateDtoSchema,
  ClientDtoSchema,
  ClientInputDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientUpdateDtoSchema,
} from "./client.schema";

export interface ClientDto extends z.infer<typeof ClientDtoSchema> {};
export interface ClientInputDto extends z.infer<typeof ClientInputDtoSchema> {};
export interface ClientCreateDto extends z.infer<typeof ClientCreateDtoSchema> {};
export interface ClientUpdateDto extends z.infer<typeof ClientUpdateDtoSchema> {};
export interface ClientPaginationQueryDto extends z.infer<typeof ClientPaginationQueryDtoSchema> {};
