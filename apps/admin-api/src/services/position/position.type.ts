import type { z } from "@hono/zod-openapi";
import type {
  PositionCreateDtoSchema,
  PositionDetailSchema,
  PositionMemberCountDetailSchema,
  PositionPaginationQueryDtoSchema,
  PositionUpdateDtoSchema,
} from "./position.schema";

export interface PositionCreateDto extends z.infer<typeof PositionCreateDtoSchema> {};
export type PositionDetail = z.infer<typeof PositionDetailSchema>;
export type PositionMemberCountDetail = z.infer<typeof PositionMemberCountDetailSchema>;
export interface PositionFuzzyQueryDto extends z.infer<typeof PositionPaginationQueryDtoSchema> {};
export type PositionSearchResult = PositionDetail[];
export interface PositionUpdateDto extends z.infer<typeof PositionUpdateDtoSchema> {};
export type { Position } from "@iam/domain/position";
