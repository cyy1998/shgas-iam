import Provider from "oidc-provider";

const ATTEMPT_INJECTOR_REGISTERED = Symbol("oidc-authorization-attempt-injector-registered");

export function registerProtocolModelPayloadExtensions(provider: Provider) {
  const onlineModels = [provider.AuthorizationCode, provider.AccessToken, provider.Grant, provider.Session, provider.Interaction];
  for (const model of onlineModels) {
    const protocolModel = model as typeof provider.AuthorizationCode & {
      IN_PAYLOAD: string[];
      verify: (payload: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
    };
    // Only a successful Redis adapter read supplies this non-persisted observation.
    const fields = protocolModel.IN_PAYLOAD;
    Object.defineProperty(protocolModel, "IN_PAYLOAD", {
      configurable: true,
      get: () => [
        ...fields,
        "redisLifetimeObserved",
        ...(model === provider.Session ? ["redisPreserveDeadline", "redisObservedId"] : []),
      ],
    });
    const verify = protocolModel.verify;
    protocolModel.verify = function (payload, options) {
      return verify.call(this, payload, {
        ...options,
        ...(payload.redisLifetimeObserved === true ? { ignoreExpiration: true } : {}),
      });
    };
    const prototype = protocolModel.prototype;
    const inheritedExpiration = findExpirationGetter(prototype);
    Object.defineProperty(prototype, "isExpired", {
      configurable: true,
      get(this: { redisLifetimeObserved?: boolean }) {
        return this.redisLifetimeObserved === true ? false : inheritedExpiration?.call(this);
      },
    });
  }
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
      "globalSessionRemainingSeconds",
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
  // Session.save(configuredTTL) is the provider's normal rolling renewal. persist()
  // instead updates the acquired object without extending its existing Redis deadline.
  const sessionPrototype = sessionModel.prototype as typeof sessionModel.prototype & {
    redisPreserveDeadline?: boolean;
  };
  const persistSession = sessionPrototype.persist;
  sessionPrototype.persist = async function () {
    this.redisPreserveDeadline = true;
    try {
      return await persistSession.call(this);
    }
    finally {
      delete this.redisPreserveDeadline;
    }
  };
}

function findExpirationGetter(prototype: object): (() => boolean) | undefined {
  for (let current: object | null = prototype; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "isExpired");
    if (descriptor?.get)
      return descriptor.get;
  }
  return undefined;
}
