import type { SessionManagementService } from "@admin-api/services/session-management/session-management.service";
import type { Context } from "hono";
import type { z } from "zod";
import type { SessionManagementRouteHandler } from "./session-management.type";
import {
  defineAdminApiMutationOperation,
  defineAdminApiQueryOperation,
} from "@admin-api/lib/admin-api-adapter";
import { getAdminAuthorizationContext } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { resolveAdminAuditContext } from "@admin-api/services/audit/audit.context";
import { AuthzUnauthorizedError } from "@iam/api-core/errors";
import { router } from "@iam/api-core/trpc";
import {
  SessionManagementListLoginRestrictionsInputSchema,
  SessionManagementListSessionsInputSchema,
  SessionManagementReleaseLoginRestrictionInputSchema,
  SessionManagementRevokeSessionsInputSchema,
  SessionManagementSessionListResultVoSchema,
  toSessionManagementLoginRestrictionListResultVo,
  toSessionManagementReleaseLoginRestrictionResultVo,
  toSessionManagementRevokeSessionsResultVo,
  toSessionManagementSessionListResultVo,
} from "./session-management.schema";

export interface CreateSessionManagementAdapterDeps {
  sessionManagementService: Pick<
    SessionManagementService,
    "listLoginRestrictions" | "listSessions" | "releaseLoginRestriction" | "revokeSessions"
  >;
}

export function createSessionManagementAdapter(deps: CreateSessionManagementAdapterDeps) {
  const listLoginRestrictions = defineAdminApiQueryOperation({
    operationId: "admin.sessionManagement.listLoginRestrictions",
    input: SessionManagementListLoginRestrictionsInputSchema,
    restInput: c =>
      c.req.valid("json") as z.infer<typeof SessionManagementListLoginRestrictionsInputSchema>,
    handler: async (input) => {
      const result = await deps.sessionManagementService.listLoginRestrictions({
        pageNum: input.pageNum,
        pageSize: input.pageSize,
        userId: input.conditions.userId,
      });
      return toSessionManagementLoginRestrictionListResultVo(result);
    },
  });

  const listSessions = defineAdminApiQueryOperation({
    operationId: "admin.sessionManagement.listSessions",
    input: SessionManagementListSessionsInputSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof SessionManagementListSessionsInputSchema>,
    handler: async (input, context) => {
      const result = await deps.sessionManagementService.listSessions(
        {
          pageNum: input.pageNum,
          pageSize: input.pageSize,
          userId: input.conditions.userId,
          kind: input.conditions.kind,
        },
        getServerActor(context?.hono),
      );
      const { policy, actor } = getAdminAuthorizationContext(context.hono);
      const decision = await policy.decideOperation({
        actor,
        operationId: "admin.sessionManagement.revokeSessions",
      });
      return SessionManagementSessionListResultVoSchema.parse({
        ...toSessionManagementSessionListResultVo(result),
        allowedActions: { revoke: decision.allowed },
      });
    },
  });

  const revokeSessions = defineAdminApiMutationOperation({
    operationId: "admin.sessionManagement.revokeSessions",
    input: SessionManagementRevokeSessionsInputSchema,
    restInput: c => c.req.valid("json") as z.infer<typeof SessionManagementRevokeSessionsInputSchema>,
    handler: async (input, context) => {
      const actor = getServerActor(context?.hono);
      const result = await deps.sessionManagementService.revokeSessions(
        input,
        actor,
        resolveAdminAuditContext(context),
      );
      return toSessionManagementRevokeSessionsResultVo(result);
    },
  });

  const releaseLoginRestriction = defineAdminApiMutationOperation({
    operationId: "admin.sessionManagement.releaseLoginRestriction",
    input: SessionManagementReleaseLoginRestrictionInputSchema,
    restInput: c =>
      c.req.valid("param") as z.infer<typeof SessionManagementReleaseLoginRestrictionInputSchema>,
    handler: async (input, context) => {
      const result = await deps.sessionManagementService.releaseLoginRestriction(
        input,
        resolveAdminAuditContext(context),
      );
      return toSessionManagementReleaseLoginRestrictionResultVo(result);
    },
  });

  const sessionManagementAdminRouter = router({
    listLoginRestrictions: listLoginRestrictions.toTRPC(),
    listSessions: listSessions.toTRPC(),
    releaseLoginRestriction: releaseLoginRestriction.toTRPC(),
    revokeSessions: revokeSessions.toTRPC(),
  });

  return {
    loginRestrictionRelease:
      releaseLoginRestriction.toHandler<SessionManagementRouteHandler<"loginRestrictionRelease">>(),
    loginRestrictionsSearch:
      listLoginRestrictions.toHandler<SessionManagementRouteHandler<"loginRestrictionsSearch">>(),
    sessionManagementAdminRouter,
    sessionsRevoke: revokeSessions.toHandler<SessionManagementRouteHandler<"sessionsRevoke">>(),
    sessionsSearch: listSessions.toHandler<SessionManagementRouteHandler<"sessionsSearch">>(),
  };
}

export type SessionManagementAdapter = ReturnType<typeof createSessionManagementAdapter>;

function getServerActor(context: Context | undefined) {
  const actorUserId = context?.get("userId");
  const principalSessionId = context?.get("principalSessionId");
  if (typeof actorUserId !== "number" || !Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
    throw new AuthzUnauthorizedError("未登录");
  }
  return {
    actorUserId,
    principalSessionId:
      typeof principalSessionId === "string" && principalSessionId.trim() ? principalSessionId : null,
  };
}
