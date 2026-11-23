import {
  PositionDetailSchema,
  PositionDtoSchema,
  PositionMemberCountDetailSchema,
} from "@admin-api/services/position/position.schema";
import { z } from "@hono/zod-openapi";
import { positionStatusToString } from "@iam/contracts";
import { CustomAttributeDefinitionSchema, CustomAttributeValuesSchema } from "@iam/contracts/custom-attributes";

export const PositionCreatedVoSchema = PositionDtoSchema.extend({
  customAttributes: CustomAttributeValuesSchema.optional(),
}).openapi("PositionCreatedVo");

export const PositionVoSchema = PositionDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
  memberNumber: z.number().openapi({ example: 10 }),
}).openapi("PositionVo");

export const PositionDetailVoSchema = PositionVoSchema.extend({
  customAttributes: CustomAttributeValuesSchema.optional(),
  customAttributeDefinitions: z.array(CustomAttributeDefinitionSchema).optional(),
}).openapi("PositionDetailVo");

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
  return PositionDetailVoSchema.parse({
    ...dto,
    ...(detail.customAttributes !== undefined ? { customAttributes: detail.customAttributes } : {}),
    ...(detail.customAttributeDefinitions !== undefined
      ? { customAttributeDefinitions: detail.customAttributeDefinitions }
      : {}),
    statusText: positionStatusToString[dto.status],
    memberNumber: detail.memberNumber,
  });
}
