import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recoverExecutorResources } from "../sandcastle/resources.ts";
import { dockerSandbox } from "../sandcastle/sandbox.mts";

test("daemon access preserves ordinary client file mount validation", () => {
  const missing = join(tmpdir(), `iam-missing-${randomUUID()}`);
  expect(() =>
    dockerSandbox({
      network: "host",
      daemonAccess: { socketGroupId: 123 },
      mounts: [{ hostPath: missing, sandboxPath: "/tmp/ordinary-file" }],
    }),
  ).toThrow();
});

test("dedicated daemon socket is resolved by the daemon rather than client path validation", () => {
  const provider = dockerSandbox({ network: "host", daemonAccess: { socketGroupId: 123 } });
  expect(provider.env.DOCKER_HOST).toBe("unix:///var/run/docker.sock");
});

test.each([-1, 1.5, Number.NaN])("rejects invalid socket group %s", (socketGroupId) => {
  expect(() => dockerSandbox({ network: "host", daemonAccess: { socketGroupId } })).toThrow("GID");
});

test("daemon access requires the selected host network architecture", () => {
  expect(() => dockerSandbox({ network: "bridge", daemonAccess: { socketGroupId: 123 } })).toThrow("host networking");
});

test("dedicated socket cannot inject another Docker mount option", () => {
  expect(() => dockerSandbox({ daemonSocket: "/var/run/docker.sock,target=/tmp/other" })).toThrow("mount delimiters");
});

test("executor recovery rejects a descriptor naming another container and preserves the record", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "iam-afk-recovery-"));
  const runId = randomUUID();
  const directory = `.sandcastle/resources/executor-${runId}`;
  const path = `${directory}/executor.json`;
  const contents = JSON.stringify({
    runId,
    containerName: `unrelated-${runId}`,
    socketProbeName: `iam-afk-socket-${runId}`,
    registryFile: `${directory}/registry.jsonl`,
  });
  try {
    await mkdir(join(cwd, directory), { recursive: true });
    await writeFile(join(cwd, path), contents);
    let failure: unknown;
    try {
      await recoverExecutorResources(cwd, path);
    } catch (error) {
      failure = error;
    }
    const retained = await readFile(join(cwd, path), "utf8");
    expect(String(failure)).toContain("Invalid executor recovery record");
    expect(retained).toBe(contents);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
