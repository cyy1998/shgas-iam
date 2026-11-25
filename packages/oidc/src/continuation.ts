import type { ClientSnapshotReader } from "@iam/client-snapshot";
import { ClientSsoProtocol, ClientStatus } from "@iam/contracts";
import type { UnifiedSessionKernel, UserSessionObservation } from "@iam/session-kernel";
import {
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  type SubjectAccessOperation,
  SubjectAccessOperationDeniedError,
} from "@iam/subject-access";
import { OidcProtocolError } from "./errors";
import { createOidcState, digest, type OidcStateRedis } from "./state";

interface OidcContinuationOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  redis: OidcStateRedis;
  namespace: string;
}

export interface OidcBrowserInput {
  globalSessionToken?: string;
  browserBinding?: string;
  completion?: string;
}
function invalid(description: string): never {
  throw new OidcProtocolError("invalid_request", description);
}

export function qrRootDigest({ userSession }: UserSessionObservation) {
  return digest(JSON.stringify([userSession.userSessionId, userSession.instance]));
}

export function createOidcAuthorizationContext(options: OidcContinuationOptions) {
  const state = createOidcState(options.redis, options.namespace);
  return {
    state,
    forOperation(operation: SubjectAccessOperation, issuer: string) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function client(clientId: string) {
        const snapshot = await options.clients.acquire(clientId);
        if (snapshot.kind !== "present" || snapshot.value.clientCode !== clientId)
          throw new OidcProtocolError("invalid_client", "Unknown client");
        if (snapshot.value.status === ClientStatus.Maintenance)
          throw new OidcProtocolError("temporarily_unavailable", "Client is under maintenance", 503);
        if (
          snapshot.value.status !== ClientStatus.Enable ||
          !snapshot.value.ssoEnabled ||
          snapshot.value.ssoConfig?.protocol !== ClientSsoProtocol.Oidc
        ) {
          throw new OidcProtocolError("unauthorized_client", "Client is not enabled for OIDC");
        }
        const { ssoConfig, admissionEnabled, admissionFilter } = snapshot.value;
        return { ssoConfig, admissionEnabled, admissionFilter };
      }
      async function root(token?: string, failOnIdentityMismatch = false) {
        if (!token) return null;
        const result = await sessions.resolveUserSession(token);
        if (result.status === "corrupt")
          throw new OidcProtocolError("temporarily_unavailable", "Session state unavailable", 503);
        if (result.status !== "resolved") return null;
        const user = result.value.userSession;
        try {
          await operation.acquireForSession({
            principalSessionId: user.userSessionId,
            subjectIdentifier: user.subjectIdentifier,
            subjectContext: user.subjectContext,
          });
        } catch (error) {
          if (
            failOnIdentityMismatch &&
            error instanceof SubjectAccessOperationDeniedError &&
            error.reason === "identity_mismatch"
          ) {
            throw new OidcProtocolError("temporarily_unavailable", "Session state unavailable", 503);
          }
          if (error instanceof SubjectAccessDisabledError) return null;
          throw error;
        }
        return result.value;
      }
      async function continuation(handle: string, browser: OidcBrowserInput) {
        const saved = await state.readContinuation(handle, browser.browserBinding ?? "");
        if (!saved || saved.authorization.issuer !== issuer) invalid("Login request is invalid or expired");
        const observedClient = await client(saved.authorization.clientId);
        return { saved, observedClient };
      }
      return {
        client,
        root,
        continuation,
        async inspectLoginContinuation(handle: string, browser: OidcBrowserInput) {
          const { saved } = await continuation(handle, browser);
          return {
            clientCode: saved.authorization.clientId,
            expiresAt: saved.expiresAt,
            root: await root(browser.globalSessionToken, true),
          };
        },
        async prepareWechatQrCompletion(
          handle: string,
          browserBinding: string,
          root: { kind: "created" | "existing"; observation: UserSessionObservation },
        ) {
          const proof =
            root.kind === "created"
              ? { kind: "qr" as const, digest: qrRootDigest(root.observation) }
              : { kind: "existing" as const };
          if (!(await state.updateCompletion(handle, browserBinding, issuer, proof)))
            invalid("Login request is invalid or expired");
        },
      };
    },
  };
}

/** Auth API inspects the browser continuation and attaches the exact QR root proof. */
export function createOidcWechatQrContinuation(options: OidcContinuationOptions) {
  const context = createOidcAuthorizationContext(options);
  return {
    forOperation(operation: SubjectAccessOperation, issuer: string) {
      const { inspectLoginContinuation, prepareWechatQrCompletion } = context.forOperation(operation, issuer);
      return { inspectLoginContinuation, prepareWechatQrCompletion };
    },
  };
}
