import { SERVICE_UNAVAILABLE } from "@iam/api-core/core/http-status-codes";
import { GatewayError } from "../services/gateway/gateway.error";

export function createGatewayLifecycle() {
  let closing = false;
  const pending = new Set<Promise<void>>();
  return {
    get closing() {
      return closing;
    },
    beginShutdown() {
      closing = true;
    },
    async run<T>(operation: () => Promise<T>) {
      if (closing) throw new GatewayError("GATEWAY_STOPPING", "Gateway is shutting down", SERVICE_UNAVAILABLE);
      let completed!: () => void;
      const completion = new Promise<void>((resolve) => {
        completed = resolve;
      });
      pending.add(completion);
      try {
        return await operation();
      } finally {
        pending.delete(completion);
        completed();
      }
    },
    async drain() {
      await Promise.all(pending);
    },
  };
}

export type GatewayLifecycle = ReturnType<typeof createGatewayLifecycle>;
