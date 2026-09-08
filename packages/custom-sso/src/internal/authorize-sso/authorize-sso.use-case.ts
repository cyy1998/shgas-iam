import type { AuthorizeSsoDeps } from "./authorize-sso.port";
import type { AuthorizeSsoInput, AuthorizeSsoOptions } from "./authorize-sso.type";
import { InvalidRedirectUriError } from "@iam/api-core/errors/InvalidRedirectUriError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import { ClientStatus, CustomSsoClientMode } from "@iam/contracts";

export function createAuthorizeSsoUseCase(deps: AuthorizeSsoDeps) {
  async function execute(input: AuthorizeSsoInput, options: AuthorizeSsoOptions = {}) {
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
    const redirectUrl = deps.redirectUrls.normalizeAllowed(
      input.clientCode,
      input.redirectUrl,
      client.customSsoConfig.validRedirectUrls,
      options,
    );
    if (redirectUrl === null) {
      throw new InvalidRedirectUriError("非法重定向地址");
    }
    const grant = await deps.authorizationGrants.issueAuthorizationCode({
      token: input.globalSessionToken,
      tokenSource: input.tokenSource,
      clientCode: input.clientCode,
      configVersion: client.customSsoConfigVersion,
      mode: client.customSsoConfig.mode,
      redirectUrl,
      requestContext: options.requestContext,
      ...(input.state === undefined ? {} : { state: input.state }),
    });
    if (!grant.isLogin)
      return grant;
    return {
      ...grant,
      clientCode: input.clientCode,
      mode: client.customSsoConfig.mode,
      redirectUrl,
      ...(client.customSsoConfig.mode === CustomSsoClientMode.Independent
        ? { callbackEndpoint: client.customSsoConfig.callbackEndpoint }
        : {}),
      ...(input.state === undefined ? {} : { state: input.state }),
    };
  }

  return { execute };
}

export type AuthorizeSsoUseCase = ReturnType<typeof createAuthorizeSsoUseCase>;
