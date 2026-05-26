import type { z } from "@hono/zod-openapi";
import type {
  ClientCreateDtoSchema,
  ClientInputDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientUpdateDtoSchema,
} from "./client.schema";

export type { ClientDto } from "@iam/domain/client";
export interface ClientInputDto extends z.infer<typeof ClientInputDtoSchema> {};
export interface ClientCreateDto extends z.infer<typeof ClientCreateDtoSchema> {};
export interface ClientUpdateDto extends z.infer<typeof ClientUpdateDtoSchema> {};
export interface ClientPaginationQueryDto extends z.infer<typeof ClientPaginationQueryDtoSchema> {};
