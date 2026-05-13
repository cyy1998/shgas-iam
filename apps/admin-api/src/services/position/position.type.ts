import type { z } from "@hono/zod-openapi";
import type { PositionCreateDtoSchema, PositionPaginationQueryDtoSchema } from "./position.schema";

export interface PositionCreateDto extends z.infer<typeof PositionCreateDtoSchema> {};
export interface PositionFuzzyQueryDto extends z.infer<typeof PositionPaginationQueryDtoSchema> {};
