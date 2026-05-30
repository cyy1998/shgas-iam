import type { PositionRouteHandler } from "./position.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import * as auditService from "@admin-api/services/audit/audit.service";
import * as positionRepository from "@admin-api/services/position/position.repository";
import {
  PositionCreateDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionUpdateDtoSchema,
} from "@admin-api/services/position/position.schema";
import * as positionService from "@admin-api/services/position/position.service";
import { router } from "@iam/api-core/trpc";
import { paginate } from "@iam/api-core/utils";
import { PositionStatus } from "@iam/contracts";
import { z } from "zod";
import { toPositionVo } from "./position.schema";

const searchPosition = defineAdminApiQueryOperation({
  input: PositionPaginationQueryDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof PositionPaginationQueryDtoSchema>,
  handler: async (input) => {
    const positions = await positionRepository.searchPositionsFuzzy(input);
    const vos = positions.map(p => toPositionVo(p));
    return paginate(vos, input);
  },
});

const getPosition = defineAdminApiQueryOperation({
  input: z.object({ posCode: z.string() }),
  restInput: c => c.req.valid("param") as { posCode: string },
  handler: ({ posCode }) => positionService.getPositionDetailByCode(posCode),
});

const createPosition = defineAdminApiMutationOperation({
  input: PositionCreateDtoSchema,
  restInput: c => c.req.valid("json") as z.infer<typeof PositionCreateDtoSchema>,
  handler: (input, context) => positionService.setPosition(input, auditService.resolveAdminAuditContext(context)),
});

const updatePosition = defineAdminApiMutationOperation({
  input: z.object({
    posCode: z.string(),
    data: PositionUpdateDtoSchema,
  }),
  restInput: c => ({
    posCode: (c.req.valid("param") as { posCode: string }).posCode,
    data: c.req.valid("json") as z.infer<typeof PositionUpdateDtoSchema>,
  }),
  handler: ({ posCode, data }, context) =>
    positionService.updatePosition(posCode, data, auditService.resolveAdminAuditContext(context)),
});

const updatePositionStatus = defineAdminApiMutationOperation({
  input: z.object({
    posCode: z.string(),
    status: z.enum(PositionStatus),
  }),
  restInput: c => ({
    posCode: (c.req.valid("param") as { posCode: string }).posCode,
    status: (c.req.valid("json") as { status: PositionStatus }).status,
  }),
  handler: ({ posCode, status }, context) =>
    positionService.updatePositionStatus(posCode, status, auditService.resolveAdminAuditContext(context)),
});

const deletePosition = defineAdminApiMutationOperation({
  input: z.object({ posCode: z.string() }),
  restInput: c => c.req.valid("param") as { posCode: string },
  handler: ({ posCode }, context) =>
    positionService.deletePosition(posCode, auditService.resolveAdminAuditContext(context)),
});

export const positionsSearch = searchPosition.toHandler<PositionRouteHandler<"positionsSearch">>();
export const positionDetail = getPosition.toHandler<PositionRouteHandler<"positionDetail">>();
export const positionCreate = createPosition.toHandler<PositionRouteHandler<"positionCreate">>();
export const positionUpdate = updatePosition.toHandler<PositionRouteHandler<"positionUpdate">>();
export const positionStatusUpdate = updatePositionStatus.toHandler<PositionRouteHandler<"positionStatusUpdate">>();
export const positionDelete = deletePosition.toHandler<PositionRouteHandler<"positionDelete">>();

export const positionAdminRouter = router({
  search: searchPosition.toTRPC(),
  detail: getPosition.toTRPC(),
  create: createPosition.toTRPC(),
  update: updatePosition.toTRPC(),
  updateStatus: updatePositionStatus.toTRPC(),
  delete: deletePosition.toTRPC(),
});
