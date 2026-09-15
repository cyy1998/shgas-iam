import type { z } from "@hono/zod-openapi";
import type { ClientAdminDetailDtoSchema, ClientAdminListDtoSchema, GenericClientRecordSchema, GenericClientRuntimeDtoSchema } from "./schema";

export type GenericClientRecord = z.infer<typeof GenericClientRecordSchema>;
export type GenericClientRuntimeDto = z.infer<typeof GenericClientRuntimeDtoSchema>;
export type ClientAdminListDto = z.infer<typeof ClientAdminListDtoSchema>;
export type ClientAdminDetailDto = z.infer<typeof ClientAdminDetailDtoSchema>;
