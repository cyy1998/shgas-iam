import type { z } from "@hono/zod-openapi";
import type { PositionCreateDtoSchema, PositionDtoSchema, PositionPaginationQueryDtoSchema } from "./position.schema";

export type PositionDto = z.infer<typeof PositionDtoSchema>;
export type PositionCreateDto = z.infer<typeof PositionCreateDtoSchema>;
export type PositionFuzzyQueryDto = z.infer<typeof PositionPaginationQueryDtoSchema>;
