import {
  type ProcessSmokeChild,
  type RunProcessCommandSmokeOptions,
  runProcessCommandSmoke,
} from "@iam/test-support/process-smoke-harness";

export async function runOpsCommandSmoke(
  options: RunProcessCommandSmokeOptions,
  interruptWhen?: (signal: AbortSignal) => Promise<void>,
) {
  if (!interruptWhen) return await runProcessCommandSmoke(options);

  let child: ProcessSmokeChild | undefined;
  const completion = runProcessCommandSmoke({
    ...options,
    start: () => (child = options.start()),
  });
  if (!child) return await completion;

  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]);
  const ready = Promise.resolve().then(() => interruptWhen(signal));
  try {
    await Promise.race([
      ready,
      completion.then(() => {
        throw new Error(`${options.label}: command finished before interruption readiness`);
      }),
    ]);
    if (!child.kill("SIGTERM")) throw new Error(`${options.label}: could not send SIGTERM`);
    return await completion;
  } catch (error) {
    controller.abort();
    const [, command] = await Promise.allSettled([ready, completion]);
    if (command.status === "rejected" && command.reason !== error) {
      throw new AggregateError([error, command.reason], `${options.label}: interruption and command both failed`);
    }
    throw error;
  }
}
