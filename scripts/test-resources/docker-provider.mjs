import { prepareManagedGatewayApisix } from "../../apps/gateway/test-integration/support/apisix-provider.mjs";
import {
  finishManagedResourceRun,
  managedServiceEndpoint,
  saveManagedResourceRun,
  startManagedResources,
} from "./managed-resources.mjs";

export const dockerResourceProvider = {
  name: "docker",
  composeFile: "scripts/test-resources/compose.yaml",
  async prepare(neededServices, context) {
    const { run, signal, timeoutMs, cleanupTimeoutMs } = context;
    const commandOptions = { signal, timeoutMs, cleanupTimeoutMs };
    if (run.record.services.length > 0) {
      await startManagedResources(run, commandOptions);
    }

    const rawEndpoints = {};
    if (neededServices.includes("postgres")) {
      const { host, port } = await managedServiceEndpoint(run, "postgres", 5432, commandOptions);
      rawEndpoints.postgresUrl = `postgres://iam_test:iam_test@${host}:${port}/iam_test`;
    }
    if (neededServices.includes("redis")) {
      const { host, port } = await managedServiceEndpoint(run, "redis", 6379, commandOptions);
      rawEndpoints.redisUrl = `redis://${host}:${port}/0`;
    }
    if (neededServices.includes("apisix")) {
      rawEndpoints.apisix = await prepareManagedGatewayApisix({
        run,
        ...commandOptions,
        // The shared coordinator validates APISIX readiness and empty baseline uniformly for all providers.
        verifyBaseline: false,
      });
    }
    return rawEndpoints;
  },
  async cleanup(run, options = {}) {
    const hasManagedStack =
      (run.record.status !== "created" && run.record.services.length > 0) || Boolean(run.record.apisix);
    if (!hasManagedStack) {
      run.record.status = "cleaned";
      await saveManagedResourceRun(run);
      return;
    }
    await finishManagedResourceRun(run, {
      cleanupTimeoutMs: options.cleanupTimeoutMs,
      diagnostics: Boolean(options.diagnostics),
    });
  },
};
