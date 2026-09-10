import process from "node:process";
import { expect, test } from "bun:test";
import { createSessionKernelRedisTestHarness } from "../../src/testing";

test("observes Code and parentless Return Handle read cost", async () => {
  const url = process.env.IAM_SESSION_KERNEL_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_SESSION_KERNEL_TEST_REDIS_URL required");
  const harness = await createSessionKernelRedisTestHarness(url);
  const commands: Array<{ name: string; startedAt: number; completedAt: number }> = [];
  const scope = await harness.createSessionKernelScope({ observeWriterCommand: value => commands.push(value) });
  try {
    for (const artifactType of ["authorization_code", "return_handle"]) {
      const purpose = { protocol: "oidc", artifactType };
      const issued = await scope.writer.createProtocolArtifact({ ...purpose, ttlMs: 30_000, tokenKind: artifactType === "return_handle" ? "oidcReturnHandle" : "authCode" });
      if (issued.status !== "created" || !issued.externalToken)
        throw new Error("expected Artifact");
      for (let sample = 0; sample < 5; sample++) {
        commands.length = 0;
        const started = performance.now();
        const resolved = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
        const elapsedMs = performance.now() - started;
        expect(resolved.status).toBe("resolved");
        console.info(JSON.stringify({ artifactType, sample, elapsedMs, commands }));
      }
    }
  }
  finally {
    await scope.close();
    await harness.close();
  }
});
