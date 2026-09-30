import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "./command-fixture";

async function waitForDescendantPort(path: string, signal: AbortSignal) {
  const readinessSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  for (;;) {
    readinessSignal.throwIfAborted();
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      await delay(25, undefined, { signal: readinessSignal });
      continue;
    }
    const { port } = JSON.parse(source) as { port: number };
    return port;
  }
}

async function bindReleasedPort(port: number) {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
}

describe("owned command fixture", () => {
  test.each([0, 23])(
    "returns exit code %i with bounded output",
    async (exitCode) => {
      await withCommandFixture("iam-command-output-", async (root, signal) => {
        const script = `process.stdout.write('x'.repeat(256 * 1024) + 'OUTPUT_TAIL', () => process.exit(${exitCode}));`;
        const result = await runOwnedCommand([process.execPath, "-e", script], root, signal);
        expect(result.exitCode).toBe(exitCode);
        expect(result.output).toContain("OUTPUT_TAIL");
        expect(result.output).toContain("output truncated");
        expect(Buffer.byteLength(result.output)).toBeLessThan(65 * 1024);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each(["deadline", "abort"] as const)(
    "releases a ready descendant's port after %s",
    async (failure) => {
      await withCommandFixture("iam-command-tree-", async (root, signal) => {
        const controller = new AbortController();
        const readyPath = join(root, "ready.json");
        const completion = runOwnedCommand(
          [process.execPath, join(import.meta.dirname, "fixtures", "command-tree.mjs"), "leader", readyPath],
          root,
          AbortSignal.any([signal, controller.signal]),
          12_000,
        ).then(
          () => undefined,
          (error: unknown) => error,
        );
        const failures: unknown[] = [];
        try {
          const port = await waitForDescendantPort(readyPath, signal);
          if (failure === "abort") controller.abort(new Error("scenario cancelled after descendant readiness"));
          const error = await completion;
          expect(error).toBeInstanceOf(Error);
          expect(error).toMatchObject({
            cause: {
              message:
                failure === "abort"
                  ? "scenario cancelled after descendant readiness"
                  : "command deadline exceeded after 12000ms",
            },
          });
          await bindReleasedPort(port);
        } catch (error) {
          failures.push(error);
        } finally {
          controller.abort();
          const commandError = await completion;
          if (commandError instanceof AggregateError) failures.push(commandError);
        }
        if (failures.length > 0) throw new AggregateError(failures, "descendant cleanup scenario failed");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "removes the owned directory when fixture initialization fails",
    async () => {
      let createdDirectory = "";
      const initializationError = new Error("fixture initialization failed");
      const error = await withCommandFixture("iam-command-initialization-", async (root) => {
        createdDirectory = root;
        throw initializationError;
      }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(error).toBe(initializationError);
      const accessError = await access(createdDirectory).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(accessError).toMatchObject({ code: "ENOENT" });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
  test.each(["SIGINT", "SIGTERM"])(
    "restores termination after cleaning the %s handler's owned directory",
    async (interruption) => {
      await withCommandFixture("iam-command-signal-observer-", async (root, signal) => {
        const descriptorPath = join(root, "owned-directory.txt");
        const exit = await runOwnedCommand(
          [
            process.execPath,
            join(import.meta.dirname, "fixtures", "interrupted-command.mts"),
            descriptorPath,
            interruption,
          ],
          root,
          signal,
        ).then(
          (result) => result.exitCode,
          (error: unknown) => error,
        );
        expect(exit).not.toBe(0);
        if (exit instanceof AggregateError) throw exit;
        const ownedDirectory = await readFile(descriptorPath, "utf8");
        for (const path of [ownedDirectory, `${descriptorPath}.continued`]) {
          const error = await access(path).then(
            () => undefined,
            (failure: unknown) => failure,
          );
          expect(error).toMatchObject({ code: "ENOENT" });
        }
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
});
