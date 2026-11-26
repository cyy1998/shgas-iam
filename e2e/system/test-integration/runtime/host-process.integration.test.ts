import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHostProcess } from "../../src/host-process.ts";
import { allocateAvailablePort } from "../../src/port-allocation.ts";

test("lets a cooperative host process finish its shutdown on SIGTERM", async () => {
  const directory = await mkdtemp(join(tmpdir(), "iam-e2e-graceful-"));
  const port = await allocateAvailablePort();
  const marker = join(directory, "shutdown");
  try {
    const server = await startHostProcess({
      service: "graceful",
      cwd: directory,
      args: [
        "-e",
        `process.once("SIGTERM", async () => {
          await Bun.sleep(400);
          await Bun.write(${JSON.stringify(marker)}, "finished");
          await server.stop(true);
        });
        const server = Bun.serve({
          hostname: "127.0.0.1", port: ${port}, fetch: () => new Response("ready"),
        });`,
      ],
      env: process.env,
      origin: `http://127.0.0.1:${port}`,
      healthPath: "/",
      logDirectory: directory,
    });
    const started = performance.now();
    await server.stop();
    const shutdown = await readFile(marker, "utf8");
    expect(shutdown).toBe("finished");
    expect(performance.now() - started).toBeLessThan(2_900);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

test("waits for readiness, logs both streams and force-stops an uncooperative process tree", async () => {
  const directory = await mkdtemp(join(tmpdir(), "iam-e2e-process-"));
  const port = await allocateAvailablePort();
  const childPort = await allocateAvailablePort();
  const stdout = join(directory, "probe.stdout.log");
  const stderr = join(directory, "probe.stderr.log");
  try {
    const server = await startHostProcess({
      service: "probe",
      cwd: directory,
      args: [
        "-e",
        `const descendant = Bun.spawn([process.execPath, "-e",
          'process.on("SIGTERM", () => {}); Bun.serve({ hostname: "127.0.0.1", port: ${childPort}, fetch: () => new Response("child") })'
        ], { detached: true });
        while (true) {
          try { await (await fetch("http://127.0.0.1:${childPort}")).text(); break; }
          catch { await Bun.sleep(25); }
        }
        process.on("SIGTERM", () => {});
        console.log("stdout ready");
        console.error("stderr ready");
        Bun.serve({ hostname: "127.0.0.1", port: ${port}, fetch: () => new Response("ready") });`,
      ],
      env: process.env,
      origin: `http://127.0.0.1:${port}`,
      healthPath: "/",
      logDirectory: directory,
    });
    const started = performance.now();
    await server.stop();
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(2_900);
    expect(elapsed).toBeLessThan(5_500);
    const output = await Promise.all([readFile(stdout, "utf8"), readFile(stderr, "utf8")]);
    expect(output).toEqual(["stdout ready\n", "stderr ready\n"]);
    for (const stoppedPort of [port, childPort]) {
      const response = await fetch(`http://127.0.0.1:${stoppedPort}`).catch(() => undefined);
      expect(response).toBeUndefined();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
