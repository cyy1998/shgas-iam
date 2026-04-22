import { z } from "zod";
import { Status } from "@/enums/status";
import { defineMutationOp, defineQueryOp } from "@/lib/core/business-op";
import * as positionRepository from "@/services/position/position.repository";
import {
  PositionCreateDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionUpdateDtoSchema,
} from "@/services/position/position.schema";
import * as positionService from "@/services/position/position.service";
import { paginate } from "@/utils/page.util";
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
    status: z.enum(Status),
  }),
  handler: ({ posCode, status }) => positionService.updatePositionStatus(posCode, status),
});

export const deletePositionOp = defineMutationOp({
  input: z.object({ posCode: z.string() }),
  handler: ({ posCode }) => positionService.deletePosition(posCode),
});
