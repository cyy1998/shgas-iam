import { z } from "zod";
import { defineMutationOp, defineQueryOp } from "@/lib/business-op";
import { PositionVoConverterSchema } from "@/routes/admin/position/position.schema";
import { paginate } from "@/utils/page.util";
import * as positionRepository from "./position.repository";
import {
  PositionCreateDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionStatusUpdateDtoSchema,
  PositionUpdateDtoSchema,
} from "./position.schema";
import * as positionService from "./position.service";

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
  input: z.object({ posCode: z.string() }).and(PositionStatusUpdateDtoSchema),
  handler: ({ posCode, status }) => positionService.updatePositionStatus(posCode, status),
});

export const deletePositionOp = defineMutationOp({
  input: z.object({ posCode: z.string() }),
  handler: ({ posCode }) => positionService.deletePosition(posCode),
});
