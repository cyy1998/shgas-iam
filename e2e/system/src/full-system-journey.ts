import type { RunDescriptor } from "./lifecycle.ts";

interface JourneyOperations {
  preflight: (signal?: AbortSignal) => Promise<unknown>;
  runJourney: (
    descriptor: RunDescriptor,
    signal?: AbortSignal,
  ) => Promise<unknown>;
}

interface FullSystemJourneyOperationsOptions {
  admin: JourneyOperations;
  oidc: JourneyOperations;
}

export function createFullSystemJourneyOperations(
  options: FullSystemJourneyOperationsOptions,
) {
  return {
    async preflight(signal?: AbortSignal) {
      await options.admin.preflight(signal);
      await options.oidc.preflight(signal);
    },

    async runJourney(descriptor: RunDescriptor, signal?: AbortSignal) {
      await options.admin.runJourney(descriptor, signal);
      await options.oidc.runJourney(descriptor, signal);
    },
  };
}
