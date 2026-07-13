import type { z } from "@hono/zod-openapi";
import type {
  PositionCreateDtoSchema,
  PositionDetailSchema,
  PositionPaginationQueryDtoSchema,
  PositionUpdateDtoSchema,
} from "./position.schema";

export interface PositionCreateDto extends z.infer<typeof PositionCreateDtoSchema> {};
export interface PositionFuzzyQueryDto extends z.infer<typeof PositionPaginationQueryDtoSchema> {};
export type PositionSearchResult = Array<z.infer<typeof PositionDetailSchema>>;
export interface PositionUpdateDto extends z.infer<typeof PositionUpdateDtoSchema> {};
export type { Position } from "@iam/domain/position";
