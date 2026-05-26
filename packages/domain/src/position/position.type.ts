import type { z } from "@hono/zod-openapi";
import type { PositionDtoSchema, PositionSchema } from "./schema";

export type PositionDto = z.infer<typeof PositionDtoSchema>;
export type Position = z.infer<typeof PositionSchema>;
