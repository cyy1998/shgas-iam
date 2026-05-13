import { z } from "@hono/zod-openapi";
import { selectPositionSchema } from "@iam/db/schema";

export const PositionSchema = z.object(selectPositionSchema.shape);
