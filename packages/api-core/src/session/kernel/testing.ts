import type { SessionKernelDependencies } from "./facade";
import type { SessionKernelArtifactConsumer } from "./storage/artifact-consumption";
import type {
  SessionKernelRedis,
  SessionKernelRevocationTransitions,
} from "./storage/store";
import { createSessionKernelWithStateAdapterFactories } from "./facade";
import { createInMemorySessionKernelArtifactConsumer } from "./storage/artifact-consumption";
import { createInMemorySessionKernelRevocationTransitions } from "./storage/revocation-transitions";

const consumersByRedis = new WeakMap<
  SessionKernelRedis,
  Map<string, SessionKernelArtifactConsumer>
>();
const revocationTransitionsByRedis = new WeakMap<
  SessionKernelRedis,
  Map<string, SessionKernelRevocationTransitions>
>();

export function createSessionKernelForTesting(
  deps: SessionKernelDependencies,
) {
  return createSessionKernelWithStateAdapterFactories(
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
    () => undefined,
    ({ redis, keys }) => {
      let transitionsByNamespace = revocationTransitionsByRedis.get(redis);
      if (!transitionsByNamespace) {
        transitionsByNamespace = new Map();
        revocationTransitionsByRedis.set(redis, transitionsByNamespace);
      }

      const existing = transitionsByNamespace.get(keys.namespace);
      if (existing)
        return existing;

      const transitions = createInMemorySessionKernelRevocationTransitions(redis);
      transitionsByNamespace.set(keys.namespace, transitions);
      return transitions;
    },
  );
}
