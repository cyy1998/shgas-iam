import type { AdminOperationId } from "./admin-operation.registry";
import { getAdminOperationId } from "@admin-api/lib/admin-api-adapter";
import {
  ADMIN_OPERATION_REGISTRY,
  ADMIN_REST_ONLY_OPERATION_IDS,
} from "./admin-operation.registry";

interface AdminTrpcProcedure {
  operationId: AdminOperationId;
  path: string;
}

interface TrpcRouterLike {
  _def: {
    procedures: Record<string, unknown>;
  };
}

export function createAdminTrpcOperationSurface(appRouter: TrpcRouterLike) {
  const procedures: AdminTrpcProcedure[] = [];
  for (const [path, procedure] of Object.entries(appRouter._def.procedures)) {
    const operationId = getAdminOperationId(procedure);
    if (operationId === null || operationId !== path) {
      throw new Error(
        `Admin tRPC procedure ${path} must have the matching classified operation`,
      );
    }
    procedures.push({ operationId, path });
  }

  const restOnly = new Set<AdminOperationId>(ADMIN_REST_ONLY_OPERATION_IDS);
  const expectedOperationIds = Object.keys(ADMIN_OPERATION_REGISTRY)
    .filter((operationId): operationId is AdminOperationId =>
      !restOnly.has(operationId as AdminOperationId))
    .sort();
  const mountedOperationIds = procedures
    .map(procedure => procedure.operationId)
    .sort();
  if (mountedOperationIds.join("\n") !== expectedOperationIds.join("\n")) {
    throw new Error(
      "Admin tRPC mounted operations must exactly match the closed registry",
    );
  }

  return { procedures };
}
