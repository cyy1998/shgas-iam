import type { z } from "@hono/zod-openapi";
import type {
  AdminClientRecordSchema,
  ClientCreateDtoSchema,
  ClientInputDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientUpdateDtoSchema,
} from "./client.schema";

export type { ClientAdminDetailDto, ClientAdminListDto } from "@iam/domain/client";
export type AdminClientRecord = z.infer<typeof AdminClientRecordSchema>;
export interface ClientInputDto extends z.infer<typeof ClientInputDtoSchema> {};
export interface ClientCreateDto extends z.infer<typeof ClientCreateDtoSchema> {};
export interface ClientUpdateDto extends z.infer<typeof ClientUpdateDtoSchema> {};
export interface ClientPaginationQueryDto extends z.infer<typeof ClientPaginationQueryDtoSchema> {};
