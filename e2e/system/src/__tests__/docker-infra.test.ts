import { describe, expect, test } from "bun:test";
import { createDockerInfraOperations } from "../docker-infra.ts";
import type { RunDescriptor } from "../lifecycle.ts";

const descriptor: RunDescriptor = {
  version: 1,
  runId: "run-command-contract",
  project: "iam-e2e-run-command-contract",
  gatewayPort: 43210,
  origin: "http://127.0.0.1:43210",
  artifactDirectory: "C:/tmp/iam-e2e/run-command-contract",
  labels: {
    "com.docker.compose.project": "iam-e2e-run-command-contract",
    "com.shgas-iam.e2e.run-id": "run-command-contract",
  },
};

describe("exact-project Docker infrastructure", () => {
  test("rejects an unregistered run before starting Docker resources", async () => {
    const commands: string[][] = [];
    const operations = createDockerInfraOperations({
      repositoryRoot: "D:/repo",
      composeFile: "D:/repo/e2e/system/compose.yaml",
      requiredPaths: [],
      runCommand: async (_command, args) => {
        commands.push(args);
      },
      captureCommand: async () => ({ stdout: "", stderr: "" }),
      probeGateway: async () => undefined,
      probeOidcDiscovery: async () => undefined,
      probeSsoConfiguration: async () => undefined,
      probeRoute: async () => undefined,
    });
    const failure = await operations.startHealthyInfrastructure(descriptor).then(
      () => undefined,
      (error) => error,
    );
    expect(failure).toMatchObject({ message: expect.stringContaining("no registered managed resource record") });
    expect(commands).toEqual([]);
  });
});
