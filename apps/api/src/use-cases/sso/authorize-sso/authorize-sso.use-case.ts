import type { AuthorizeSsoDeps } from "./authorize-sso.port";
import type { AuthorizeSsoInput, AuthorizeSsoOptions } from "./authorize-sso.type";
import { InvalidRedirectUriError } from "@iam/api-core/errors/InvalidRedirectUriError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";

export function createAuthorizeSsoUseCase(deps: AuthorizeSsoDeps) {
  async function execute(input: AuthorizeSsoInput, options: AuthorizeSsoOptions = {}) {
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
    return await deps.principalSessions.authorize({
      token: input.globalSessionToken,
      tokenSource: input.tokenSource,
      clientCode: input.clientCode,
      redirectUrl: input.redirectUrl,
      requestContext: options.requestContext,
    });
  }

  return { execute };
}

export type AuthorizeSsoUseCase = ReturnType<typeof createAuthorizeSsoUseCase>;
