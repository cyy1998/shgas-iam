import type { ExchangeSsoCodeDeps } from "./exchange-sso-code.port";
import type {
  ExchangeSsoCodeInput,
  ExchangeSsoCodeOptions,
  ExchangeSsoCodeResult,
} from "./exchange-sso-code.type";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import { ClientManagementLevel } from "@iam/contracts";

export function createExchangeSsoCodeUseCase(deps: ExchangeSsoCodeDeps) {
  async function execute(
    input: ExchangeSsoCodeInput,
    options: ExchangeSsoCodeOptions = {},
  ): Promise<ExchangeSsoCodeResult> {
    const client = await deps.clients.getClientByCode(input.clientCode);
    if (client === null || input.clientSecret !== client.clientSecret) {
      throw new InvalidSsoClientError("非法Client");
    }
    const authCode = await deps.sessions.consumeAuthCode({
      code: input.code,
      clientCode: input.clientCode,
      invalidCodeError: "invalid_auth_code",
    });
    const { token, ttl, userInfo } = await deps.sessions.createLocalSession({
      authCode,
      client,
      mode: ClientManagementLevel.Independent,
      userDetail: authCode.userDetail,
      requestContext: options.requestContext,
    });
    return { sid: token, ttl, userInfo };
  }

  return { execute };
}

export type ExchangeSsoCodeUseCase = ReturnType<typeof createExchangeSsoCodeUseCase>;
