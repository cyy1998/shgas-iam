import type { ExchangeSsoCodeDeps } from "./exchange-sso-code.port";
import type {
  ExchangeSsoCodeInput,
  ExchangeSsoCodeOptions,
  ExchangeSsoCodeResult,
} from "./exchange-sso-code.type";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";

export function createExchangeSsoCodeUseCase(deps: ExchangeSsoCodeDeps) {
  async function execute(
    input: ExchangeSsoCodeInput,
    options: ExchangeSsoCodeOptions = {},
  ): Promise<ExchangeSsoCodeResult> {
    const client = await deps.clients.getClientByCode(input.clientCode);
    if (client === null || input.clientSecret !== client.clientSecret) {
      throw new InvalidSsoClientError("非法Client");
    }
    const { credential, ttl, userInfo } = await deps.authorizationGrants.redeemIndependentGrant({
      client,
      code: input.code,
      requestContext: options.requestContext,
    });
    return { sid: credential, ttl, userInfo };
  }

  return { execute };
}

export type ExchangeSsoCodeUseCase = ReturnType<typeof createExchangeSsoCodeUseCase>;
