import { expect } from "bun:test";
import { EventEmitter } from "node:events";
import { buildLoggerOptions } from "@iam/runtime/logger";
import type { CommandContext } from "@ops/command-context";
import { runOps } from "@ops/index";
import pino from "pino";

export async function runOpsCommand(
  options: { args: string[]; env: NodeJS.ProcessEnv; expectedExitCode?: number },
  interruptWhen?: (signal: AbortSignal) => Promise<void>,
) {
  let output = "";
  const emitter = new EventEmitter();
  const sink = {
    write: (message: string) => {
      output += message;
    },
  };
  const context: CommandContext = {
    env: options.env,
    stdout: sink,
    stderr: sink,
    exitCode: 0,
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    logger: (config) => pino(buildLoggerOptions(config), sink),
  };
  const completion = runOps(options.args, context, () => {});
  if (interruptWhen) {
    const controller = new AbortController();
    const ready = interruptWhen(AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]));
    try {
      await Promise.race([
        ready,
        completion.then(() => {
          throw new Error("Ops command finished before interruption readiness");
        }),
      ]);
      expect(emitter.emit("SIGTERM")).toBe(true);
    } catch (error) {
      emitter.emit("SIGTERM");
      throw error;
    } finally {
      controller.abort();
      await Promise.allSettled([ready, completion]);
    }
  }
  await completion;
  expect({ exitCode: context.exitCode, output }).toMatchObject({ exitCode: options.expectedExitCode ?? 0 });
  return { exitCode: context.exitCode, output };
}
