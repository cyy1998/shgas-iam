import type { z } from "@hono/zod-openapi";
import type { PositionCreateDtoSchema, PositionDtoSchema, PositionPaginationQueryDtoSchema, PositionQueryDtoSchema } from "./position.schema";

export interface PositionDto extends z.infer<typeof PositionDtoSchema> {};
export interface PositionCreateDto extends z.infer<typeof PositionCreateDtoSchema> {};
export interface PositionQueryDto extends z.infer<typeof PositionQueryDtoSchema> {};
export interface PositionFuzzyQueryDto extends z.infer<typeof PositionPaginationQueryDtoSchema> {};
