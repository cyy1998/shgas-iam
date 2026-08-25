import type { PositionService } from "@admin-api/services/position/position.service";
import type { PositionRouteHandler } from "./position.type";
import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { resolveAdminAuditContext } from "@admin-api/services/audit/audit.context";
import {
  PositionCreateDtoSchema,
  PositionPaginationQueryDtoSchema,
  PositionUpdateDtoSchema,
} from "@admin-api/services/position/position.schema";
import { router } from "@iam/api-core/trpc";
import { paginate } from "@iam/api-core/utils";
import { PositionStatus } from "@iam/contracts";
import { z } from "zod";
import { toPositionMemberCountVo, toPositionVo } from "./position.schema";

export interface CreatePositionAdapterDeps {
  positionService: Pick<
    PositionService,
    | "deletePosition"
    | "getPositionDetailByCode"
    | "searchPositionsFuzzy"
    | "setPosition"
    | "updatePosition"
    | "updatePositionStatus"
  >;
}

export function createPositionAdapter(deps: CreatePositionAdapterDeps) {
  const searchPosition = defineAdminApiQueryOperation({
    operationId: "admin.position.search",
    input: PositionPaginationQueryDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof PositionPaginationQueryDtoSchema>,
    handler: async (input) => {
      const positions = await deps.positionService.searchPositionsFuzzy(input);
      const vos = positions.map(p => toPositionVo(p));
      return paginate(vos, input);
    },
  });

  const getPosition = defineAdminApiQueryOperation({
    operationId: "admin.position.detail",
    input: z.object({ posCode: z.string() }),
    restInput: c => c.req.valid("param") as { posCode: string },
    handler: async ({ posCode }) => toPositionMemberCountVo(
      await deps.positionService.getPositionDetailByCode(posCode),
    ),
  });

  const createPosition = defineAdminApiMutationOperation({
    operationId: "admin.position.create",
    input: PositionCreateDtoSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof PositionCreateDtoSchema>,
    handler: (input, context) => deps.positionService.setPosition(input, resolveAdminAuditContext(context)),
  });

  const updatePosition = defineAdminApiMutationOperation({
    operationId: "admin.position.update",
    input: z.object({
      posCode: z.string(),
      data: PositionUpdateDtoSchema,
    }),
    restInput: c => ({
      posCode: (c.req.valid("param") as { posCode: string }).posCode,
      data: c.req.valid("json") as z.infer<typeof PositionUpdateDtoSchema>,
    }),
    handler: ({ posCode, data }, context) =>
      deps.positionService.updatePosition(posCode, data, resolveAdminAuditContext(context)),
  });

  const updatePositionStatus = defineAdminApiMutationOperation({
    operationId: "admin.position.updateStatus",
    input: z.object({
      posCode: z.string(),
      status: z.enum(PositionStatus),
    }),
    restInput: c => ({
      posCode: (c.req.valid("param") as { posCode: string }).posCode,
      status: (c.req.valid("json") as { status: PositionStatus }).status,
    }),
    handler: ({ posCode, status }, context) =>
      deps.positionService.updatePositionStatus(posCode, status, resolveAdminAuditContext(context)),
  });

  const deletePosition = defineAdminApiMutationOperation({
    operationId: "admin.position.delete",
    input: z.object({ posCode: z.string() }),
    restInput: c => c.req.valid("param") as { posCode: string },
    handler: ({ posCode }, context) =>
      deps.positionService.deletePosition(posCode, resolveAdminAuditContext(context)),
  });

  const positionAdminRouter = router({
    search: searchPosition.toTRPC(),
    detail: getPosition.toTRPC(),
    create: createPosition.toTRPC(),
    update: updatePosition.toTRPC(),
    updateStatus: updatePositionStatus.toTRPC(),
    delete: deletePosition.toTRPC(),
  });

  return {
    positionAdminRouter,
    positionCreate: createPosition.toHandler<PositionRouteHandler<"positionCreate">>(),
    positionDelete: deletePosition.toHandler<PositionRouteHandler<"positionDelete">>(),
    positionDetail: getPosition.toHandler<PositionRouteHandler<"positionDetail">>(),
    positionsSearch: searchPosition.toHandler<PositionRouteHandler<"positionsSearch">>(),
    positionStatusUpdate: updatePositionStatus.toHandler<PositionRouteHandler<"positionStatusUpdate">>(),
    positionUpdate: updatePosition.toHandler<PositionRouteHandler<"positionUpdate">>(),
  };
}

export type PositionAdapter = ReturnType<typeof createPositionAdapter>;
