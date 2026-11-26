import { type ClientSnapshotReader, ClientSnapshotUnavailableError } from "@iam/client-snapshot";
import { ClientSsoProtocol, ClientStatus } from "@iam/contracts";
import { AuthzMaintenanceError, AuthzUnauthorizedError, BadRequestError } from "@iam/runtime/errors";
import { SessionStorageError, type UnifiedSessionKernel } from "@iam/session-kernel";
import {
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  type SubjectAccessOperation,
  SubjectAccessOperationDeniedError,
  SubjectAccessUnavailableError,
} from "@iam/subject-access";
import { InvalidSsoClientError } from "../authorization.error";
import { CustomSsoTrafficGateUnavailableError } from "../internal/traffic-gate";
import { type CustomSsoStateRedis, createCustomSsoState } from "./state";

interface CustomSsoContinuationOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  clients: ClientSnapshotReader;
  redis: CustomSsoStateRedis;
  namespace: string;
}

export interface AuthorizationInput {
  clientCode: string;
  redirectUrl: string;
  state?: string;
  globalSessionToken?: string;
  continuation?: string;
  browserBinding?: string;
}

export function createCustomSsoAuthorizationContext(options: CustomSsoContinuationOptions) {
  const state = createCustomSsoState(options.redis, options.namespace);
  return {
    state,
    forOperation(operation: SubjectAccessOperation) {
      requireSubjectAccessOperation(operation);
      const sessions = options.kernel.forOperation(operation);
      async function client(clientCode: string) {
        let snapshot: Awaited<ReturnType<typeof options.clients.acquire>>;
        try {
          snapshot = await options.clients.acquire(clientCode);
        } catch (error) {
          if (error instanceof ClientSnapshotUnavailableError) throw new CustomSsoTrafficGateUnavailableError();
          throw error;
        }
        if (snapshot.kind === "present" && snapshot.value.status === ClientStatus.Maintenance)
          throw new AuthzMaintenanceError();
        if (
          snapshot.kind !== "present" ||
          snapshot.value.clientCode !== clientCode ||
          snapshot.value.status !== ClientStatus.Enable ||
          !snapshot.value.ssoEnabled ||
          snapshot.value.ssoConfig?.protocol !== ClientSsoProtocol.CustomSso
        ) {
          throw new InvalidSsoClientError("非法Client");
        }
        return { ...snapshot.value, ssoConfig: snapshot.value.ssoConfig };
      }
      async function continuation(input: AuthorizationInput, snapshot: Awaited<ReturnType<typeof client>>) {
        const continuation = await state.readContinuation(input.continuation ?? "", input.browserBinding ?? "");
        if (!continuation) throw new BadRequestError("登录请求已失效，请返回应用重新发起登录");
        const { expiresAt, ...accepted } = continuation;
        if (
          accepted.clientCode !== input.clientCode ||
          accepted.redirectUrl !== input.redirectUrl ||
          accepted.state !== input.state ||
          accepted.redeemer !== snapshot.ssoConfig.callbackType
        ) {
          throw new BadRequestError("登录请求已失效，请返回应用重新发起登录");
        }
        return { accepted, client: snapshot, expiresAt };
      }
      async function root(token?: string, failOnIdentityMismatch = false) {
        if (!token) return null;
        try {
          const result = await sessions.resolveUserSession(token);
          if (result.status === "corrupt") throw new SubjectAccessUnavailableError();
          if (result.status !== "resolved") return null;
          const user = result.value.userSession;
          await operation.acquireForSession({
            principalSessionId: user.userSessionId,
            subjectIdentifier: user.subjectIdentifier,
            subjectContext: user.subjectContext,
          });
          return result.value;
        } catch (error) {
          if (
            failOnIdentityMismatch &&
            error instanceof SubjectAccessOperationDeniedError &&
            error.reason === "identity_mismatch"
          ) {
            throw new SubjectAccessUnavailableError(error);
          }
          if (error instanceof SubjectAccessDisabledError || error instanceof AuthzUnauthorizedError) return null;
          if (error instanceof SessionStorageError) throw new SubjectAccessUnavailableError();
          throw error;
        }
      }
      return {
        client,
        continuation,
        root,
        async inspectLoginContinuation(input: AuthorizationInput) {
          if (input.continuation === undefined) throw new BadRequestError("登录请求已失效，请返回应用重新发起登录");
          const snapshot = await client(input.clientCode);
          const { accepted, expiresAt } = await continuation(input, snapshot);
          return { clientCode: accepted.clientCode, expiresAt, root: await root(input.globalSessionToken, true) };
        },
      };
    },
  };
}

export function createCustomSsoWechatQrContinuation(options: CustomSsoContinuationOptions) {
  const context = createCustomSsoAuthorizationContext(options);
  return {
    forOperation(operation: SubjectAccessOperation) {
      return { inspectLoginContinuation: context.forOperation(operation).inspectLoginContinuation };
    },
  };
}
