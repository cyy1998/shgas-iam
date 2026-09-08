import type { CompleteSsoCallbackDeps } from "./complete-sso-callback.port";
import type {
  CompleteSsoCallbackInput,
  CompleteSsoCallbackOptions,
  CompleteSsoCallbackResult,
} from "./complete-sso-callback.type";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import { ClientStatus, CustomSsoClientMode } from "@iam/contracts";

export function createCompleteSsoCallbackUseCase(deps: CompleteSsoCallbackDeps) {
  async function execute(
    input: CompleteSsoCallbackInput,
    options: CompleteSsoCallbackOptions = {},
  ): Promise<CompleteSsoCallbackResult> {
    await deps.trafficGate.assertIssuanceAllowed(input.clientCode);
    const client = await deps.clients.findRuntimeRecord(input.clientCode);
    if (
      client === null
      || client.status === ClientStatus.Disable
      || client.isDelete
      || !client.customSsoEnabled
      || client.customSsoConfig?.mode !== CustomSsoClientMode.Gateway
      || client.customSsoConfig.orcas === undefined
    ) {
      throw new InvalidSsoClientError("非法client代码");
    }
    const { token, ttl, orcasSessionId, state } = await deps.authorizationGrants.completeGatewayLogin({
      client: {
        clientCode: client.clientCode,
        configVersion: client.customSsoConfigVersion,
        orcasEnabled: client.customSsoConfig.orcas.enabled,
      },
      code: input.code,
      redirectUrl: input.redirectUrl,
      requestContext: options.requestContext,
    });
    return {
      orcasSessionId,
      ...(state === undefined ? {} : { state }),
      token,
      ttl,
    };
  }

  return { execute };
}

export type CompleteSsoCallbackUseCase = ReturnType<typeof createCompleteSsoCallbackUseCase>;
