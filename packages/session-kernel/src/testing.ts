import type { SessionKernelDependencies } from "./facade";
import type { SessionKernelArtifactConsumer } from "./storage/artifact-consumption";
import type {
  SessionKernelRedis,
  SessionKernelRevocationTransitions,
} from "./storage/store";
import { normalizeSessionKernelConfig } from "./config";
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
  redisClock = normalizeSessionKernelConfig(deps.config).clock,
) {
  return createSessionKernelWithStateAdapterFactories(deps, ...createTestingFactories(redisClock));
}

function createTestingFactories(redisClock: { now: () => number }): [
  Parameters<typeof createSessionKernelWithStateAdapterFactories>[1],
  Parameters<typeof createSessionKernelWithStateAdapterFactories>[2],
  Parameters<typeof createSessionKernelWithStateAdapterFactories>[3],
  Parameters<typeof createSessionKernelWithStateAdapterFactories>[4],
] {
  return [
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
    redis => ({
      async now() { return redisClock.now(); },
      async read(key) {
        const observedAt = redisClock.now();
        return { observedAt, serialized: await redis.get(key) };
      },
    }),
  ];
}

export { createSessionKernelKeyBuilder, encodeIndexMember } from "./storage/keys";
export { KernelFakeRedis } from "./testing/fake-redis";
export { createKernelMaintenanceFixture } from "./testing/maintenance-fixture";
export { createSessionKernelRedisTestHarness, waitForRedisCondition } from "./testing/redis-test-harness";
export type { RedisTestHarness, SessionKernelRedisTestScope } from "./testing/redis-test-harness";
