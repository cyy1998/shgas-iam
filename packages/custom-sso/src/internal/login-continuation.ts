import type { CheckSsoLoginContinuationDeps } from "./login-continuation.port";
import type { CheckSsoLoginContinuationInput } from "./login-continuation.type";
import { InvalidRedirectUriError } from "@iam/api-core/errors/InvalidRedirectUriError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import {
  ClientStatus,
} from "@iam/contracts";

export function createCheckSsoLoginContinuation(
  deps: CheckSsoLoginContinuationDeps,
) {
  async function execute(input: CheckSsoLoginContinuationInput) {
    await deps.trafficGate.assertIssuanceAllowed(input.clientCode);
    const client = await deps.clients.findRuntimeRecord(input.clientCode);
    if (
      client === null
      || client.status === ClientStatus.Disable
      || client.isDelete
      || !client.customSsoEnabled
      || client.customSsoConfig === null
    ) {
      throw new InvalidSsoClientError("非法client代码");
    }
    if (deps.redirectUrls.normalizeAllowed(
      input.clientCode,
      input.redirectUrl,
      client.customSsoConfig.validRedirectUrls,
    ) === null) {
      throw new InvalidRedirectUriError("非法重定向地址");
    }

    const session = await deps.principalSessions.inspectPrincipalSession(
      input.globalSessionToken,
    );
    return session;
  }

  return { execute };
}

export type CheckSsoLoginContinuationUseCase
  = ReturnType<typeof createCheckSsoLoginContinuation>;
