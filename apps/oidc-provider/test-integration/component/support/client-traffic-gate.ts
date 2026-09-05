import type { ClientTrafficGateResult } from "@iam/api-core/client-traffic-gate";
import { createOidcClientTrafficGate } from "../../../src/provider/client/client-traffic-gate.ts";

export function createClientTrafficGateController() {
  let defaultOutcome: ClientTrafficGateResult = { outcome: "enabled" };
  const clientOutcomes = new Map<string, ClientTrafficGateResult>();
  return {
    trafficGate: createOidcClientTrafficGate({
      gate: { check: async clientId => clientOutcomes.get(clientId) ?? defaultOutcome },
    }),
    setClientOutcome(clientId: string, outcome: ClientTrafficGateResult) {
      clientOutcomes.set(clientId, outcome);
    },
    setDefaultOutcome(outcome: ClientTrafficGateResult) {
      defaultOutcome = outcome;
    },
  };
}
