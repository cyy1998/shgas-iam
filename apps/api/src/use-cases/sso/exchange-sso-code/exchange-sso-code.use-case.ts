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
    const client = await deps.clientCredentials.authenticate(
      input.clientCode,
      input.clientSecret,
    );
    if (client === null) {
      throw new InvalidSsoClientError("非法Client");
    }
    const { credential, ttl, subject } = await deps.authorizationGrants.redeemIndependentGrant({
      client,
      code: input.code,
      redirectUri: input.redirectUri,
      requestContext: options.requestContext,
    });
    return { sid: credential, ttl, subject };
  }

  return { execute };
}

export type ExchangeSsoCodeUseCase = ReturnType<typeof createExchangeSsoCodeUseCase>;
