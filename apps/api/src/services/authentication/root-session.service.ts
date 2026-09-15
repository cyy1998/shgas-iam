import type { ClientSnapshotReader } from "@iam/api-core/client-snapshot";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { CustomSsoProjectionPermission } from "@iam/custom-sso";
import type { UnifiedSessionKernel } from "@iam/session-kernel";
import { ClientSnapshotUnavailableError } from "@iam/api-core/client-snapshot";
import { AuthzMaintenanceError, AuthzUnauthorizedError } from "@iam/api-core/errors";
import { SubjectAccessUnavailableError } from "@iam/api-core/subject-access";
import { parseSubjectClaimSelection, SUBJECT_CLAIM_CATALOG } from "@iam/client-subject-projection";
import { ClientSsoProtocol, ClientStatus } from "@iam/contracts";
import {
  CustomSsoClientDeliveryUnauthorizedError,
  CustomSsoRequestMismatchError,
  CustomSsoTrafficGateUnavailableError,
} from "@iam/custom-sso";
import { resolveCustomSsoSubjectProjection } from "@iam/custom-sso/wire";
import { SessionStorageError } from "@iam/session-kernel";

interface RootSessionServiceDeps {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  logoutApplicationToken?: (token: string, operation: SubjectAccessOperation) => Promise<boolean>;
  clients: ClientSnapshotReader;
  projection: import("@iam/client-subject-projection").PermittedClientSubjectProjectionService<CustomSsoProjectionPermission>;
}

/** IAM root consumption. Protocol tokens remain with their respective owners. */
export function createRootSessionService(deps: RootSessionServiceDeps) {
  return {
    forOperation(operation: SubjectAccessOperation) {
      const sessions = deps.kernel.forOperation(operation);
      async function resolve(token: string) {
        try {
          const result = await sessions.resolveUserSession(token);
          if (result.status === "corrupt")
            throw new SubjectAccessUnavailableError();
          return result;
        }
        catch (error) {
          if (error instanceof SessionStorageError)
            throw new SubjectAccessUnavailableError();
          throw error;
        }
      }
      async function acceptClient(clientCode: string) {
        let snapshot;
        try {
          snapshot = await deps.clients.acquire(clientCode);
        }
        catch (error) {
          if (error instanceof ClientSnapshotUnavailableError)
            throw new CustomSsoTrafficGateUnavailableError();
          throw error;
        }
        if (snapshot.kind === "present" && snapshot.value.status === ClientStatus.Maintenance)
          throw new AuthzMaintenanceError();
        if (
          snapshot.kind !== "present"
          || snapshot.value.clientCode !== clientCode
          || snapshot.value.status !== ClientStatus.Enable
          || !snapshot.value.ssoEnabled
          || snapshot.value.ssoConfig?.protocol !== ClientSsoProtocol.CustomSso
        ) {
          throw new CustomSsoClientDeliveryUnauthorizedError();
        }
        return snapshot.value.ssoConfig;
      }
      async function resolvePermittedRoot(token: string) {
        const root = await resolve(token);
        if (root.status !== "resolved")
          throw new AuthzUnauthorizedError("未登录");
        const user = root.value.userSession;
        const permission = await operation.acquireForSession({
          principalSessionId: user.userSessionId,
          subjectIdentifier: user.subjectIdentifier,
          subjectContext: user.subjectContext,
        });
        return { observation: root.value, permission };
      }
      return {
        resolvePermittedRoot,
        async resolvePublicAuthentication(token: string, clientCode: string) {
          if (clientCode !== "iam")
            throw new CustomSsoRequestMismatchError();
          const root = await resolvePermittedRoot(token);
          const config = await acceptClient(clientCode);
          const subjectIdentifier = root.observation.userSession.subjectIdentifier;
          const selection = parseSubjectClaimSelection({
            catalogVersion: SUBJECT_CLAIM_CATALOG.version,
            claims: [...config.subjectClaims],
          });
          return {
            authenticationContext: { subjectIdentifier, authenticatedClientCode: clientCode },
            subjectDeliveryCapability: Object.freeze({
              resolveUserInfo: async () =>
                await resolveCustomSsoSubjectProjection(
                  {
                    resolve: async input =>
                      await deps.projection.resolve(input, { operation, permission: root.permission }),
                  },
                  { subjectIdentifier, clientCode, selection },
                ),
            }),
          };
        },
        async logout(token?: string, allowApplicationToken = false) {
          if (!token)
            return true;
          const root = await resolve(token);
          if (root.status !== "resolved") {
            if (allowApplicationToken)
              await deps.logoutApplicationToken?.(token, operation);
            return true;
          }
          const result = await sessions.revokeObservedUserSession(root.value);
          if (result.status === "failed" || result.status === "unknown")
            throw new SubjectAccessUnavailableError();
          return true;
        },
      };
    },
  };
}
