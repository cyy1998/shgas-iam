import { z } from "@hono/zod-openapi";
import { selectPositionSchema } from "@iam/db/schema";

export const PositionDtoSchema = z.object(selectPositionSchema.shape).openapi("PositionDto");
export const PositionSchema = PositionDtoSchema;
