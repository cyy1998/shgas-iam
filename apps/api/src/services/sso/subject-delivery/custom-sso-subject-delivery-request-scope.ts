import type {
  CustomSsoSubjectDeliveryCapability,
} from "./custom-sso-subject-delivery";

export function createCustomSsoSubjectDeliveryRequestScope() {
  const capabilities = new WeakMap<
    object,
    CustomSsoSubjectDeliveryCapability
  >();

  async function runWithCapability<T>(
    request: object,
    capability: CustomSsoSubjectDeliveryCapability,
    action: () => Promise<T>,
  ): Promise<T> {
    if (capabilities.has(request)) {
      throw new TypeError(
        "Custom SSO subject delivery capability is already bound",
      );
    }
    capabilities.set(request, capability);
    try {
      return await action();
    }
    finally {
      capabilities.delete(request);
    }
  }

  async function resolveUserInfoForRequest(request: object) {
    const capability = capabilities.get(request);
    if (capability === undefined) {
      throw new TypeError(
        "Custom SSO subject delivery capability is not request-scoped",
      );
    }
    return await capability.resolveUserInfo();
  }

  return {
    resolveUserInfoForRequest,
    runWithCapability,
  };
}

export type CustomSsoSubjectDeliveryRequestScope = ReturnType<
  typeof createCustomSsoSubjectDeliveryRequestScope
>;
