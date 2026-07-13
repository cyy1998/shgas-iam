import type { CompleteSsoCallbackDeps } from "./complete-sso-callback.port";
import type {
  CompleteSsoCallbackInput,
  CompleteSsoCallbackOptions,
  CompleteSsoCallbackResult,
} from "./complete-sso-callback.type";
import { InvalidRedirectUriError } from "@iam/api-core/errors/InvalidRedirectUriError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import { ClientManagementLevel } from "@iam/contracts";

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
    const authCode = await deps.sessions.consumeAuthCode({
      code: input.code,
      clientCode: input.clientCode,
      redirectUrl: input.redirectUrl,
      invalidCodeError: "unauthorized",
    });
    let orcas: { userId: string; sessionId: string } | null = null;
    if (client.extAttributes.requireOrcas === true) {
      const { orcasSessionId, orcasId } = await deps.orcas.orcasLogin(authCode.userDetail);
      orcas = { userId: orcasId, sessionId: orcasSessionId };
    }
    const { token } = await deps.sessions.createLocalSession({
      authCode,
      client,
      mode: ClientManagementLevel.Gateway,
      userDetail: authCode.userDetail,
      orcas,
      requestContext: options.requestContext,
    });
    return {
      orcasSessionId: orcas?.sessionId ?? null,
      token,
    };
  }

  return { execute };
}

export type CompleteSsoCallbackUseCase = ReturnType<typeof createCompleteSsoCallbackUseCase>;
