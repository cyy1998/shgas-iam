import type { SessionKernelArtifactConsumer } from "./artifact-consumption";
import type { SessionKernelDependencies } from "./facade";
import type { SessionKernelRedis } from "./store";
import { createInMemorySessionKernelArtifactConsumer } from "./artifact-consumption";
import { createSessionKernelWithArtifactConsumerFactory } from "./facade";

const consumersByRedis = new WeakMap<
  SessionKernelRedis,
  Map<string, SessionKernelArtifactConsumer>
>();

export function createSessionKernelForTesting(
  deps: SessionKernelDependencies,
) {
  return createSessionKernelWithArtifactConsumerFactory(
    deps,
    ({ redis, keys }) => {
      let consumersByNamespace = consumersByRedis.get(redis);
      if (!consumersByNamespace) {
        consumersByNamespace = new Map();
        consumersByRedis.set(redis, consumersByNamespace);
      }

      const existing = consumersByNamespace.get(keys.namespace);
      if (existing)
        return existing;

      const consumer = createInMemorySessionKernelArtifactConsumer(redis, keys);
      consumersByNamespace.set(keys.namespace, consumer);
      return consumer;
    },
  );
}
