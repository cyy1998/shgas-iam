import { createServer } from "node:net";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import {
  createBoundedProcessLogCapture,
  FatalReadinessError,
  PortCollisionError,
  type ProcessSmokeChild,
  recoverFromPortCollision,
  terminateProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/test-support/process-smoke-harness";

type ProcessContext = { origin: string; port: number; temporaryDirectory: string };

export async function startEmploymentProcess(input: {
  label: string;
  hostname: string;
  temporaryDirectoryPrefix: string;
  stopExecutors: Array<() => Promise<void> | void>;
  start: (context: ProcessContext) => ProcessSmokeChild;
  probe: (origin: string, output: string, signal: AbortSignal) => Promise<boolean>;
  stop?: (child: ProcessSmokeChild, context: ProcessContext, output: () => string) => Promise<void>;
}) {
  const ready = Promise.withResolvers<ProcessContext & { output: () => string }>();
  const stopRequested = Promise.withResolvers<void>();
  const completion = recoverFromPortCollision(
    () =>
      withOwnedTemporaryDirectory({
        prefix: input.temporaryDirectoryPrefix,
        cleanupTimeoutMs: 5_000,
        run: async (temporaryDirectory) => {
          const port = await allocatePort(input.hostname);
          const context = { origin: `http://${input.hostname}:${port}`, port, temporaryDirectory };
          await runWithOwnedTestResources(async ({ registerCleanup }) => {
            const child = input.start(context);
            const logs = createBoundedProcessLogCapture(child, { maxBytes: 64 * 1024 });
            let childError: Error | undefined;
            const onChildError = (error: Error) => {
              childError = error;
            };
            child.on("error", onChildError);
            registerCleanup(() => {
              child.off("error", onChildError);
              logs.dispose();
            });
            registerCleanup(() => terminateProcessTree(child, { timeoutMs: 5_000 }));

            await waitUntilReady(input.label, context.origin, child, () => childError, logs.snapshot, input.probe);
            ready.resolve({ ...context, output: logs.snapshot });
            await stopRequested.promise;
            await input.stop?.(child, context, logs.snapshot);
          });
        },
      }),
    { maxAttempts: 3 },
  );

  function stop() {
    stopRequested.resolve();
    return completion;
  }
  input.stopExecutors.push(stop);
  const process = await Promise.race([
    ready.promise,
    completion.then(() => {
      throw new Error(`${input.label} stopped before readiness`);
    }),
  ]);
  return { ...process, stop };
}

async function waitUntilReady(
  label: string,
  origin: string,
  child: ProcessSmokeChild,
  readChildError: () => Error | undefined,
  snapshot: () => string,
  probe: (origin: string, output: string, signal: AbortSignal) => Promise<boolean>,
) {
  const signal = AbortSignal.timeout(30_000);
  while (!signal.aborted) {
    const output = snapshot();
    if (/EADDRINUSE|address already in use/iu.test(output))
      throw new PortCollisionError(`${label} port collision at ${origin}\n${output}`);
    const childError = readChildError();
    if (childError || child.exitCode !== null || child.signalCode !== null)
      throw new Error(`${label} exited before readiness\n${output}`, { cause: childError });
    try {
      if (await probe(origin, output, signal)) return;
    } catch (error) {
      if (error instanceof FatalReadinessError || (!(error instanceof TypeError) && !signal.aborted)) throw error;
    }
    await Bun.sleep(100);
  }
  throw new Error(`${label} readiness timed out\n${snapshot()}`);
}

async function allocatePort(hostname: string) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, hostname, resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!address || typeof address === "string") throw new Error(`Could not allocate a test port for ${hostname}`);
  return address.port;
}
