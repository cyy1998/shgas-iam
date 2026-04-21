import { z } from "zod";
import { defineOp } from "@/lib/business-op";
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

export const searchPositionOp = defineOp({
  input: PositionPaginationQueryDtoSchema,
  kind: "query",
  handler: async (input) => {
    const positions = await positionRepository.searchPositionsFuzzy(input);
    const vos = positions.map(p => PositionVoConverterSchema.parse(p));
    return paginate(vos, input);
  },
});

export const getPositionOp = defineOp({
  input: z.object({ posCode: z.string() }),
  kind: "query",
  handler: ({ posCode }) => positionService.getPositionDetailByCode(posCode),
});

export const createPositionOp = defineOp({
  input: PositionCreateDtoSchema,
  kind: "mutation",
  handler: input => positionService.setPosition(input),
});

export const updatePositionOp = defineOp({
  input: z.object({
    posCode: z.string(),
    data: PositionUpdateDtoSchema,
  }),
  kind: "mutation",
  handler: ({ posCode, data }) => positionService.updatePosition(posCode, data),
});

export const updatePositionStatusOp = defineOp({
  input: z.object({ posCode: z.string() }).and(PositionStatusUpdateDtoSchema),
  kind: "mutation",
  handler: ({ posCode, status }) => positionService.updatePositionStatus(posCode, status),
});

export const deletePositionOp = defineOp({
  input: z.object({ posCode: z.string() }),
  kind: "mutation",
  handler: ({ posCode }) => positionService.deletePosition(posCode),
});
