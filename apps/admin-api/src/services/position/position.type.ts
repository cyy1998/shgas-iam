import type { z } from "@hono/zod-openapi";
import type { PositionCreateDtoSchema, PositionPaginationQueryDtoSchema, PositionUpdateDtoSchema } from "./position.schema";

export interface PositionCreateDto extends z.infer<typeof PositionCreateDtoSchema> {};
export interface PositionFuzzyQueryDto extends z.infer<typeof PositionPaginationQueryDtoSchema> {};
export interface PositionUpdateDto extends z.infer<typeof PositionUpdateDtoSchema> {};
