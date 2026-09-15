import type { CreateAdminRootAuthenticationHandlersDeps } from "@admin-api/middlewares/authentication.handler";
import type { AdminSessionManagementServiceDeps } from "@admin-api/services/session-management/session-management.port";
import type { AdminUserServiceDeps } from "@admin-api/services/user/user.port";
import type {
  SubjectAccessOperation,
  SubjectAccessOperationBarrierPort,
  UnifiedSessionRevocationSummary,
} from "@iam/api-core/subject-access";
import type { UnifiedSessionKernel } from "@iam/session-kernel";
import { createAdminRootAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createSessionManagementAdapter } from "@admin-api/routes/admin/session-management/session-management.adapter";
import { createUserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { createSessionManagementService } from "@admin-api/services/session-management/session-management.service";
import { createUserService } from "@admin-api/services/user/user.service";
import {
  createSubjectAccessOperations,
  createUnifiedSubjectAccessSessionRevocation,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { SessionStorageError } from "@iam/session-kernel";
import { createUnifiedAdminLifecycleRevocation } from "./session/unified-lifecycle";

export interface RootSecurityCompositionOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  barrier: SubjectAccessOperationBarrierPort;
  user: Omit<AdminUserServiceDeps, "sessionRevocation" | "resetPasswordSessionEffect">;
  sessions: Omit<AdminSessionManagementServiceDeps, "control" | "userControl" | "inventory">;
  config: CreateAdminRootAuthenticationHandlersDeps["config"];
}

/** Candidate management consumers share the same root generation as authentication. */
export function createRootSecurityComposition(options: RootSecurityCompositionOptions) {
  let operations: ReturnType<typeof createSubjectAccessOperations>;
  const revocation = createUnifiedSubjectAccessSessionRevocation(options.kernel, {
    run: callback => operations.run(callback),
  });
  operations = createSubjectAccessOperations({ barrier: options.barrier, revocation });
  const lifecycleRevocation = createUnifiedAdminLifecycleRevocation(revocation, options.sessions.logger);
  function managementSummary(sessions: UnifiedSessionRevocationSummary) {
    return { sessions };
  }
  const sessionManagement = createSessionManagementService({
    ...options.sessions,
    control: {
      revokePrincipalSession: async (id, reason) =>
        managementSummary(await revocation.revokePrincipalSession(id, reason)),
      executeCapturedSessions: async (targets, exclude) =>
        managementSummary(await revocation.executeCapturedSessions(targets, exclude)),
    },
    inventory: {
      async listPrincipalSessions(input) {
        return await operations.run(async (operation) => {
          const page = await options.kernel
            .forOperation(operation)
            .listSessions({
              kind: input.kind ?? "userSession",
              subjectIdentifier: input.subjectIdentifier,
              offset: input.offset,
              limit: input.limit,
            });
          return {
            total: page.total,
            items: page.records.map(record => ({
              principalSessionId: record.userSessionId,
              principal: { subjectId: record.subjectIdentifier },
              authTime: record.kind === "userSession" ? record.authTime : record.authorizedAt,
              amr: record.kind === "userSession" ? record.amr : [],
              expiresAt: record.expiresAt,
              ...(record.kind === "userSession" && record.origin ? { origin: record.origin } : {}),
              record: {
                kind: record.kind,
                identity: {
                  kind: record.kind,
                  id: record.kind === "userSession" ? record.userSessionId : record.clientSessionId,
                  instance: record.instance,
                  userSessionId: record.userSessionId,
                  subjectIdentifier: record.subjectIdentifier,
                  ...(record.kind === "clientSession" ? { clientId: record.clientId } : {}),
                },
                ...(record.kind === "clientSession"
                  ? { clientId: record.clientId, protocol: record.protocol }
                  : {}),
              },
            })),
          };
        });
      },
    },
    userControl: {
      revokeUserSessions: async input =>
        managementSummary(
          await revocation.revokeUserSessions({ subjectId: input.subjectIdentifier }, input.reason, {
            exceptPrincipalSessionId: input.exceptPrincipalSessionId,
          }),
        ),
    },
  });
  const user = createUserService({
    ...options.user,
    sessionRevocation: lifecycleRevocation,
    async resetPasswordSessionEffect(input) {
      if (input.auditContext?.actorUserId === undefined || input.auditContext.actorUserId === null)
        throw new Error("Password reset actor is required");
      const effect = await sessionManagement.revokeSessions(
        { target: { type: "user", userId: input.userId } },
        {
          actorUserId: input.auditContext.actorUserId,
          principalSessionId: input.auditContext.principalSessionId ?? null,
        },
        input.auditContext,
      );
      if (!("sessions" in effect.result))
        throw new Error("Session effect was not confirmed");
      return effect.result.sessions;
    },
  });
  const authentication = createAdminRootAuthenticationHandlers({
    subjectAccess: operations,
    userService: user,
    config: options.config,
    async resolveRoot(token, operation) {
      try {
        const result = await options.kernel.forOperation(operation).resolveUserSession(token);
        if (result.status === "corrupt")
          throw new SubjectAccessUnavailableError();
        return result.status === "resolved" ? result.value.userSession : null;
      }
      catch (error) {
        if (error instanceof SessionStorageError)
          throw new SubjectAccessUnavailableError();
        throw error;
      }
    },
  });
  return {
    authentication,
    operations,
    revocation,
    lifecycleRevocation,
    sessionManagement,
    user,
    sessionManagementAdapter: createSessionManagementAdapter({ sessionManagementService: sessionManagement }),
    userAdapter: createUserAdapter({ userService: user, random: options.user.random }),
  };
}
