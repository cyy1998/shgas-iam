import { CONFLICT, SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { GatewayError } from "./gateway.error";

/** A service instance owns one apply at a time, including all of its remote reads. */
export function createGatewayExecution() {
  let busy = false;
  let blocked = false;
  return {
    block() {
      blocked = true;
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
      if (busy) throw new GatewayError("GATEWAY_BUSY", "Another apply is in progress", CONFLICT);
      if (blocked)
        throw new GatewayError(
          "GATEWAY_BLOCKED",
          "Publishing requires manual recovery and restart",
          SERVICE_UNAVAILABLE,
        );
      busy = true;
      try {
        return await operation();
      } finally {
        busy = false;
      }
    },
  };
}
