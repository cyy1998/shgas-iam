import type {
  ExactProjectJourneyLifecycle,
  RunDescriptor,
} from "./lifecycle.ts";
import { describe, expect, test } from "bun:test";
import { createFullSystemJourneyOperations } from "./full-system-journey.ts";
import { runExactProjectJourneyLifecycle } from "./lifecycle.ts";

const descriptor: RunDescriptor = {
  version: 1,
  runId: "full-system-journey-01",
  project: "iam-e2e-full-system-journey-01",
  gatewayPort: 43123,
  origin: "http://127.0.0.1:43123",
  artifactDirectory: "C:/tmp/iam-e2e/full-system-journey-01",
  labels: {
    "com.docker.compose.project": "iam-e2e-full-system-journey-01",
    "com.shgas-iam.e2e.run-id": "full-system-journey-01",
  },
};

describe("complete Full-system E2E journey", () => {
  test("preflights both journeys before resources and then runs Admin before OIDC", async () => {
    const events: string[] = [];
    const operations = createFullSystemJourneyOperations({
      admin: {
        preflight: async () => events.push("preflight:admin"),
        runJourney: async () => events.push("journey:admin"),
      },
      oidc: {
        preflight: async () => events.push("preflight:oidc"),
        runJourney: async () => events.push("journey:oidc"),
      },
    });

    await operations.preflight();
    events.push("resources");
    await operations.runJourney(descriptor);

    expect(events).toEqual([
      "preflight:admin",
      "preflight:oidc",
      "resources",
      "journey:admin",
      "journey:oidc",
    ]);
  });

  test("propagates journey and cleanup failures after diagnostics", async () => {
    const events: string[] = [];
    const adminFailure = new Error("Admin journey failed");
    const cleanupFailure = new Error("exact-project cleanup failed");
    const journeys = createFullSystemJourneyOperations({
      admin: {
        preflight: async () => undefined,
        runJourney: async () => {
          events.push("journey:admin");
          throw adminFailure;
        },
      },
      oidc: {
        preflight: async () => undefined,
        runJourney: async () => events.push("journey:oidc"),
      },
    });
    const lifecycle: ExactProjectJourneyLifecycle = {
      ...journeys,
      awaitGatewayRouteReadiness: async () => undefined,
      cleanup: async () => {
        events.push("cleanup");
        throw cleanupFailure;
      },
      collectDiagnostics: async () => events.push("diagnostics"),
      createDescriptor: async () => descriptor,
      initializeMigrationReceipt: async () => undefined,
      persistDescriptor: async () => undefined,
      prepareDiagnostics: async () => undefined,
      renderGatewayRoutes: async () => undefined,
      runMigrations: async () => undefined,
      seedE2EScenario: async () => undefined,
      startHealthyInfrastructure: async () => undefined,
      startRepoRuntimes: async () => undefined,
      verifyCanonicalOriginConfiguration: async () => undefined,
    };

    let failure: unknown;
    try {
      await runExactProjectJourneyLifecycle(lifecycle);
    }
    catch (error) {
      failure = error;
    }

    expect(events).toEqual(["journey:admin", "diagnostics", "cleanup"]);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError))
      throw new Error("expected AggregateError");
    expect(failure.errors).toEqual([adminFailure, cleanupFailure]);
  });
});
