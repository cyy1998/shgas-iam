import * as positionRepository from "@admin-api/services/position/position.repository";
import {
  PositionCreateDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionUpdateDtoSchema,
} from "@admin-api/services/position/position.schema";
import * as positionService from "@admin-api/services/position/position.service";
import { defineMutationOp, defineQueryOp } from "@iam/api-core/core/business-op";
import { paginate } from "@iam/api-core/utils";
import { PositionStatus } from "@iam/contracts";
import { z } from "zod";
import { PositionVoConverterSchema } from "./position.schema";

export const searchPositionOp = defineQueryOp({
  input: PositionPaginationQueryDtoSchema,
  handler: async (input) => {
    const positions = await positionRepository.searchPositionsFuzzy(input);
    const vos = positions.map(p => PositionVoConverterSchema.parse(p));
    return paginate(vos, input);
  },
});

export const getPositionOp = defineQueryOp({
  input: z.object({ posCode: z.string() }),
  handler: ({ posCode }) => positionService.getPositionDetailByCode(posCode),
});

export const createPositionOp = defineMutationOp({
  input: PositionCreateDtoSchema,
  handler: input => positionService.setPosition(input),
});

export const updatePositionOp = defineMutationOp({
  input: z.object({
    posCode: z.string(),
    data: PositionUpdateDtoSchema,
  }),
  handler: ({ posCode, data }) => positionService.updatePosition(posCode, data),
});

export const updatePositionStatusOp = defineMutationOp({
  input: z.object({
    posCode: z.string(),
    status: z.enum(PositionStatus),
  }),
  handler: ({ posCode, status }) => positionService.updatePositionStatus(posCode, status),
});

export const deletePositionOp = defineMutationOp({
  input: z.object({ posCode: z.string() }),
  handler: ({ posCode }) => positionService.deletePosition(posCode),
});
