import type { z } from "@hono/zod-openapi";
import type { PositionAdminVoSchema, PositionCreateDtoSchema, PositionDtoSchema, PositionFuzzyQueryDtoSchema } from "./position.schema";

export type PositionDto = z.infer<typeof PositionDtoSchema>;
export type PositionCreateDto = z.infer<typeof PositionCreateDtoSchema>;
export type PositionFuzzyQueryDto = z.infer<typeof PositionFuzzyQueryDtoSchema>;
export type PositionAdminVo = z.infer<typeof PositionAdminVoSchema>;
