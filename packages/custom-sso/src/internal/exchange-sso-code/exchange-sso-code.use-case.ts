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
    const rejectedGrant = { code: input.code, clientCode: input.clientCode, redirectUri: input.redirectUri, mode: CustomSsoClientMode.Independent };
    try {
      await deps.trafficGate.assertIssuanceAllowed(input.clientCode);
    }
    catch (error) {
      if (error instanceof InvalidSsoClientError)
        await deps.authorizationGrants.rejectAuthorizationGrant(rejectedGrant);
      throw error;
    }
    const runtimeClient = await deps.clients.findRuntimeRecord(input.clientCode);
    if (runtimeClient !== null && (runtimeClient.clientCode !== client.clientCode
      || runtimeClient.customSsoConfigVersion !== client.configVersion)) {
      // Authentication and the accepted runtime may straddle a configuration change.
      // That mismatch does not establish permanent invalidity of the submitted Grant.
      throw new InvalidSsoClientError("非法Client");
    }
    if (
      runtimeClient === null
      || runtimeClient.status === ClientStatus.Disable
      || runtimeClient.isDelete
      || !runtimeClient.customSsoEnabled
      || runtimeClient.customSsoConfig?.mode
      !== CustomSsoClientMode.Independent
    ) {
      await deps.authorizationGrants.rejectAuthorizationGrant(rejectedGrant);
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
