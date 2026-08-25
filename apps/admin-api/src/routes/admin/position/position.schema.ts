import {
  PositionDetailSchema,
  PositionDtoSchema,
  PositionMemberCountDetailSchema,
} from "@admin-api/services/position/position.schema";
import { z } from "@hono/zod-openapi";
import { positionStatusToString } from "@iam/contracts";

export const PositionVoSchema = PositionDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
  memberNumber: z.number().openapi({ example: 10 }),
}).openapi("PositionVo");

export function toPositionVo(input: unknown) {
  const e = PositionDetailSchema.parse(input);
  const dto = PositionDtoSchema.parse(e);
  return PositionVoSchema.parse({
    ...dto,
    statusText: positionStatusToString[dto.status],
    memberNumber: e.employments.length,
  });
}

export function toPositionMemberCountVo(input: unknown) {
  const detail = PositionMemberCountDetailSchema.parse(input);
  const dto = PositionDtoSchema.parse(detail);
  return PositionVoSchema.parse({
    ...dto,
    statusText: positionStatusToString[dto.status],
    memberNumber: detail.memberNumber,
  });
}
