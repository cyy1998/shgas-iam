import type { ExchangeSsoCodeDeps } from "./exchange-sso-code.port";
import type {
  ExchangeSsoCodeInput,
  ExchangeSsoCodeOptions,
  ExchangeSsoCodeResult,
} from "./exchange-sso-code.type";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import { ClientStatus, CustomSsoClientMode } from "@iam/contracts";

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
    await deps.trafficGate.assertIssuanceAllowed(input.clientCode);
    const runtimeClient = await deps.clients.findRuntimeRecord(input.clientCode);
    if (
      runtimeClient === null
      || runtimeClient.clientCode !== client.clientCode
      || runtimeClient.status === ClientStatus.Disable
      || runtimeClient.isDelete
      || !runtimeClient.customSsoEnabled
      || runtimeClient.customSsoConfig?.mode
      !== CustomSsoClientMode.Independent
      || runtimeClient.customSsoConfigVersion !== client.configVersion
    ) {
      throw new InvalidSsoClientError("非法Client");
    }
    const { credential, ttl, subject } = await deps.authorizationGrants.redeemIndependentGrant({
      client: {
        clientCode: runtimeClient.clientCode,
        configVersion: runtimeClient.customSsoConfigVersion,
        subjectClaims: [...runtimeClient.customSsoConfig.subjectClaims],
      },
      code: input.code,
      redirectUri: input.redirectUri,
      requestContext: options.requestContext,
    });
    return { sid: credential, ttl, subject };
  }

  return { execute };
}

export type ExchangeSsoCodeUseCase = ReturnType<typeof createExchangeSsoCodeUseCase>;
