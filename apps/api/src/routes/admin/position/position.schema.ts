import { z } from "@hono/zod-openapi";
import { positionStatusToString } from "@/enums/position.status";
import { PositionDetailSchema, PositionDtoSchema } from "@/services/position/position.schema";

export const PositionVoSchema = PositionDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
  memberNumber: z.number().openapi({ example: 10 }),
}).openapi("PositionVo");

export const PositionVoConverterSchema = PositionDetailSchema.transform((e) => {
  const dto = PositionDtoSchema.parse(e);
  return {
    ...dto,
    statusText: positionStatusToString[dto.status],
    memberNumber: e.employments.length,
  };
}).pipe(PositionVoSchema);
