import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ProcessSmokeChild, ProcessTreeOwner } from "@iam/api-core/testing/process-smoke-harness";

export class FakeChild extends EventEmitter implements ProcessSmokeChild {
  readonly pid: number | undefined = 321;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  private closed = false;

  constructor(readonly processTreeOwner?: ProcessTreeOwner) {
    super();
  }

  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.finish(null, signal);
    return true;
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null = null) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }

  emitClose() {
    if (this.closed) return;
    this.closed = true;
    this.stdout.end();
    this.stderr.end();
    this.stdout.destroy();
    this.stderr.destroy();
    this.emit("close", this.exitCode, this.signalCode);
  }

  finish(code: number | null, signal: NodeJS.Signals | null = null) {
    this.emitExit(code, signal);
    this.emitClose();
  }
}

export async function captureFailure(promise: Promise<unknown>) {
  let failure: unknown;
  try {
    await promise;
  } catch (error) {
    failure = error;
  }
  if (!(failure instanceof Error)) throw new Error("expected the process smoke operation to fail");
  return failure;
}

export function stopFakeChild(child: ProcessSmokeChild) {
  child.kill("SIGKILL");
  return Promise.resolve();
}
