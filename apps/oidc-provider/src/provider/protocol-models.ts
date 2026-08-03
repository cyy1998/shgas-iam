import Provider from "oidc-provider";

const ATTEMPT_INJECTOR_REGISTERED = Symbol("oidc-authorization-attempt-injector-registered");

export function registerProtocolModelPayloadExtensions(provider: Provider) {
  const authorizationCodeModel = provider.AuthorizationCode as typeof provider.AuthorizationCode & {
    IN_PAYLOAD: string[];
  };
  const authorizationCodePayload = authorizationCodeModel.IN_PAYLOAD;
  Object.defineProperty(authorizationCodeModel, "IN_PAYLOAD", {
    configurable: true,
    get: () => [
      ...authorizationCodePayload,
      "authorizationAttemptId",
      "claimsSnapshot",
      "globalSessionExpiresAt",
    ],
  });
  const authorizationCodePrototype = authorizationCodeModel.prototype as unknown as {
    [ATTEMPT_INJECTOR_REGISTERED]?: boolean;
    authorizationAttemptId?: string;
    save?: (...args: unknown[]) => Promise<unknown>;
  };
  const saveAuthorizationCode = authorizationCodePrototype.save;
  if (saveAuthorizationCode && !authorizationCodePrototype[ATTEMPT_INJECTOR_REGISTERED]) {
    authorizationCodePrototype.save = async function (...args) {
      const interactionUid = Provider.ctx?.oidc.entities.Interaction?.uid;
      if (interactionUid)
        this.authorizationAttemptId = interactionUid;
      return await saveAuthorizationCode.apply(this, args);
    };
    authorizationCodePrototype[ATTEMPT_INJECTOR_REGISTERED] = true;
  }

  const sessionModel = provider.Session as typeof provider.Session & {
    IN_PAYLOAD: string[];
  };
  const sessionPayload = sessionModel.IN_PAYLOAD;
  Object.defineProperty(sessionModel, "IN_PAYLOAD", {
    configurable: true,
    get: () => [
      ...sessionPayload,
      "kernelPrincipalSessionId",
      "providerSessionAnchorGeneration",
    ],
  });
}
