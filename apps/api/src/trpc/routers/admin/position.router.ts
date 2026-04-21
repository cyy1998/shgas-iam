import { z } from "zod";
import {
  PositionCreateDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionStatusUpdateDtoSchema,
  PositionUpdateDtoSchema,
} from "@/services/position/position.schema";
import * as positionRepository from "@/services/position/position.repository";
import * as positionService from "@/services/position/position.service";
import { paginate } from "@/utils/page.util";
import { PositionVoConverterSchema } from "@/routes/admin/position/position.schema";
import { mapCustomErrorToTRPCError, publicProcedure, router } from "../../trpc";

export const positionAdminRouter = router({
  search: publicProcedure
    .input(PositionPaginationQueryDtoSchema)
    .query(async ({ input }) => {
      try {
        const positions = await positionRepository.searchPositionsFuzzy(input);
        const positionVos = positions.map(p => PositionVoConverterSchema.parse(p));
        return paginate(positionVos, input);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  detail: publicProcedure
    .input(z.object({ posCode: z.string() }))
    .query(async ({ input }) => {
      try {
        return await positionService.getPositionDetailByCode(input.posCode);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  create: publicProcedure
    .input(PositionCreateDtoSchema)
    .mutation(async ({ input }) => {
      try {
        return await positionService.setPosition(input);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  update: publicProcedure
    .input(z.object({ posCode: z.string(), data: PositionUpdateDtoSchema }))
    .mutation(async ({ input }) => {
      try {
        return await positionService.updatePosition(input.posCode, input.data);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  updateStatus: publicProcedure
    .input(z.object({ posCode: z.string() }).and(PositionStatusUpdateDtoSchema))
    .mutation(async ({ input }) => {
      try {
        return await positionService.updatePositionStatus(input.posCode, input.status);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),

  delete: publicProcedure
    .input(z.object({ posCode: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await positionService.deletePosition(input.posCode);
      }
      catch (err) {
        mapCustomErrorToTRPCError(err);
      }
    }),
});
