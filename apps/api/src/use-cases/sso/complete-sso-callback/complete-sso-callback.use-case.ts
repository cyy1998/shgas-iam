import type { CompleteSsoCallbackDeps } from "./complete-sso-callback.port";
import type {
  CompleteSsoCallbackInput,
  CompleteSsoCallbackOptions,
  CompleteSsoCallbackResult,
} from "./complete-sso-callback.type";
import { InvalidRedirectUriError } from "@iam/api-core/errors/InvalidRedirectUriError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";

export function createCompleteSsoCallbackUseCase(deps: CompleteSsoCallbackDeps) {
  async function execute(
    input: CompleteSsoCallbackInput,
    options: CompleteSsoCallbackOptions = {},
  ): Promise<CompleteSsoCallbackResult> {
    const client = await deps.clients.getClientByCode(input.clientCode);
    if (client === null) {
      throw new InvalidSsoClientError("非法client代码");
    }
    if (!deps.redirectUrls.isAllowed(
      input.clientCode,
      input.redirectUrl,
      client.extAttributes.validRedirectUrls,
      options,
    )) {
      throw new InvalidRedirectUriError("非法重定向地址");
    }
    const { token, orcasSessionId } = await deps.authorizationGrants.completeGatewayLogin({
      client,
      code: input.code,
      redirectUrl: input.redirectUrl,
      requestContext: options.requestContext,
    });
    return {
      orcasSessionId,
      token,
    };
  }

  return { execute };
}

export type CompleteSsoCallbackUseCase = ReturnType<typeof createCompleteSsoCallbackUseCase>;
