import { z } from "@hono/zod-openapi";
import { selectPositionSchema } from "@iam/db/schema";

export const PositionDtoSchema = z.object(selectPositionSchema.pick({
  id: true,
  posCode: true,
  posName: true,
  status: true,
  description: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
}).shape).openapi("PositionDto");
export const PositionSchema = PositionDtoSchema;
