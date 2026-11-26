import { acquireIamRootClient, type ClientSnapshotReader, ClientSnapshotUnavailableError } from "@iam/client-snapshot";
import { parseSubjectClaimSelection, SUBJECT_CLAIM_CATALOG } from "@iam/client-subject-projection";
import { AuthzMaintenanceError, AuthzUnauthorizedError } from "@iam/runtime/errors";
import type { UnifiedSessionKernel } from "@iam/session-kernel";
import { SessionStorageError } from "@iam/session-kernel";
import type { SubjectAccessOperation } from "@iam/subject-access";
import { SubjectAccessUnavailableError } from "@iam/subject-access";
import { CustomSsoClientDeliveryUnauthorizedError } from "./client-delivery.error";
import { CustomSsoTrafficGateUnavailableError } from "./internal/traffic-gate";
import { CustomSsoRequestMismatchError } from "./protocol-validation.error";
import { resolveCustomSsoSubjectProjection } from "./wire";

interface RootSessionServiceDeps {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  logoutApplicationToken?: (token: string, operation: SubjectAccessOperation) => Promise<boolean>;
  clients: ClientSnapshotReader;
  projection: import("@iam/client-subject-projection").PermittedClientSubjectProjectionService<SubjectAccessOperation>;
}

/** IAM root consumption. Protocol tokens remain with their respective owners. */
export function createRootSessionService(deps: RootSessionServiceDeps) {
  return {
    forOperation(operation: SubjectAccessOperation) {
      const sessions = deps.kernel.forOperation(operation);
      async function resolve(token: string) {
        try {
          const result = await sessions.resolveUserSession(token);
          if (result.status === "corrupt") throw new SubjectAccessUnavailableError();
          return result;
        } catch (error) {
          if (error instanceof SessionStorageError) throw new SubjectAccessUnavailableError();
          throw error;
        }
      }
      async function acceptClient() {
        const client = await acquireIamRootClient(deps.clients).catch((error: unknown) => {
          if (error instanceof ClientSnapshotUnavailableError) throw new CustomSsoTrafficGateUnavailableError();
          throw error;
        });
        if (client.kind === "maintenance") throw new AuthzMaintenanceError();
        if (client.kind !== "accepted") throw new CustomSsoClientDeliveryUnauthorizedError();
        return client.config;
      }
      async function resolvePermittedRoot(token: string) {
        const root = await resolve(token);
        if (root.status !== "resolved") throw new AuthzUnauthorizedError("未登录");
        const user = root.value.userSession;
        await operation.acquireForSession({
          principalSessionId: user.userSessionId,
          subjectIdentifier: user.subjectIdentifier,
          subjectContext: user.subjectContext,
        });
        return { observation: root.value };
      }
      return {
        resolvePermittedRoot,
        async resolvePublicAuthentication(token: string, clientCode: string) {
          if (clientCode !== "iam") throw new CustomSsoRequestMismatchError();
          const root = await resolvePermittedRoot(token);
          const config = await acceptClient();
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
                    resolve: async (input) => await deps.projection.resolve(input, operation),
                  },
                  { subjectIdentifier, clientCode, selection },
                ),
            }),
          };
        },
        async logout(token?: string, allowApplicationToken = false) {
          if (!token) return true;
          const root = await resolve(token);
          if (root.status !== "resolved") {
            if (allowApplicationToken) await deps.logoutApplicationToken?.(token, operation);
            return true;
          }
          const result = await sessions.revokeObservedUserSession(root.value);
          if (result.status === "failed" || result.status === "unknown") throw new SubjectAccessUnavailableError();
          return true;
        },
      };
    },
  };
}
