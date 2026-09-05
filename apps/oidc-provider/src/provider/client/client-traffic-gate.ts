import type { ClientTrafficGateResult } from "@iam/api-core/client-traffic-gate";
import type ProviderType from "oidc-provider";
import Provider, { errors } from "oidc-provider";

const CLIENT_TRAFFIC_GATE_REGISTERED = Symbol("oidc-client-traffic-gate-registered");
const TOKEN_ISSUANCE_ROUTE = "token";

export class OidcOnlineAccessUnavailableError extends errors.TemporarilyUnavailable {
  constructor() {
    super();
    this.status = 503;
    this.statusCode = 503;
  }
}

export interface OidcClientTrafficGate {
  assertIssuanceAllowed: (clientCode: string) => Promise<void>;
  assertOnlineAccessAllowed: (clientCode: string) => Promise<void>;
}

export function createOidcClientTrafficGate(deps: {
  gate: {
    check: (clientCode: string) => Promise<ClientTrafficGateResult>;
  };
}): OidcClientTrafficGate {
  async function assertClientTrafficAllowed(
    clientCode: string,
    use: "issuance" | "online-access",
  ) {
    const result = await deps.gate.check(clientCode);
    if (result.outcome === "maintenance" || result.outcome === "unavailable") {
      throw use === "online-access"
        ? new OidcOnlineAccessUnavailableError()
        : new errors.TemporarilyUnavailable();
    }
    if (result.outcome === "disabled" || result.outcome === "deleted") {
      throw use === "online-access"
        ? new errors.InvalidToken("client is unavailable")
        : new errors.InvalidClient("client is unavailable");
    }
  }

  return {
    async assertIssuanceAllowed(clientCode: string) {
      await assertClientTrafficAllowed(clientCode, "issuance");
    },
    async assertOnlineAccessAllowed(clientCode: string) {
      await assertClientTrafficAllowed(clientCode, "online-access");
    },
  };
}

export function registerOidcClientTrafficGate(
  provider: ProviderType,
  trafficGate: OidcClientTrafficGate,
) {
  const clientModel = provider.Client as typeof provider.Client & {
    [CLIENT_TRAFFIC_GATE_REGISTERED]?: boolean;
  };
  if (clientModel[CLIENT_TRAFFIC_GATE_REGISTERED])
    return;

  const findClient = clientModel.find;
  clientModel.find = async function (...args) {
    const clientId = args[0];
    if (Provider.ctx?.oidc.route === TOKEN_ISSUANCE_ROUTE && typeof clientId === "string" && clientId)
      await trafficGate.assertIssuanceAllowed(clientId);
    return await findClient.apply(this, args);
  };
  clientModel[CLIENT_TRAFFIC_GATE_REGISTERED] = true;
}
