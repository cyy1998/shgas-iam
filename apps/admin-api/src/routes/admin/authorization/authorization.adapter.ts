import type { AuthorizationRouteHandler } from "./authorization.type";
import { defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { getAdminAuthorizationContext } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { router } from "@iam/api-core/trpc";
import { z } from "zod";

export function createAdminAuthorizationAdapter() {
  const capabilitySummary = defineAdminApiQueryOperation({
    operationId: "admin.authorization.capabilitySummary",
    input: z.object({}),
    restInput: () => ({}),
    handler: async (_input, context) => {
      const { actor, policy } = getAdminAuthorizationContext(
        context.hono,
      );
      return await policy.getCapabilitySummary(actor);
    },
  });

  return {
    authorizationAdminRouter: router({
      capabilitySummary: capabilitySummary.toTRPC(),
    }),
    capabilitySummary: capabilitySummary.toHandler<
      AuthorizationRouteHandler<"capabilitySummary">
    >(),
  };
}

export type AdminAuthorizationAdapter = ReturnType<
  typeof createAdminAuthorizationAdapter
>;
