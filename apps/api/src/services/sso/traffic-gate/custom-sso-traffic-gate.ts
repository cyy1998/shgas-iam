import type { ClientTrafficGateResult } from "@iam/api-core/client-traffic-gate";
import type { CustomSsoTrafficGate } from "./custom-sso-traffic-gate.type";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import { RETRYABLE_SERVICE_UNAVAILABLE } from "@iam/contracts";

export class CustomSsoTrafficGateUnavailableError extends Error {
  public readonly retryability = RETRYABLE_SERVICE_UNAVAILABLE;

  constructor(options?: { cause?: unknown }) {
    super("Custom SSO client traffic state is temporarily unavailable", options);
    this.name = "CustomSsoTrafficGateUnavailableError";
  }
}

export function createCustomSsoTrafficGate(deps: {
  gate: {
    check: (clientCode: string) => Promise<ClientTrafficGateResult>;
  };
}): CustomSsoTrafficGate {
  async function check(clientCode: string) {
    const result = await deps.gate.check(clientCode);
    if (result.outcome === "enabled")
      return;
    if (result.outcome === "maintenance")
      throw new AuthzMaintenanceError();
    if (result.outcome === "unavailable")
      throw new CustomSsoTrafficGateUnavailableError();
    return result;
  }

  async function assertIssuanceAllowed(clientCode: string) {
    const result = await check(clientCode);
    if (result?.outcome === "disabled" || result?.outcome === "deleted")
      throw new InvalidSsoClientError("非法Client");
  }

  async function assertSessionUseAllowed(clientCode: string) {
    const result = await check(clientCode);
    if (result?.outcome === "disabled" || result?.outcome === "deleted")
      throw new AuthzUnauthorizedError("未登录");
  }

  return { assertIssuanceAllowed, assertSessionUseAllowed };
}
