import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";

export type OwnedProcessTree = ChildProcess & {
  readonly processTreeOwner: "windows-job" | "posix-process-group";
  readonly stdout: Readable;
  readonly stderr: Readable;
  /** Linux owner 有界停止并等待全部继承本次 ancestry 的执行者，包括 detached / reparented 后代。 */
  readonly closeOwnedProcessTree?: (options: { timeoutMs: number; forceAfterMs?: number }) => Promise<void>;
};
export function spawnOwnedProcessTree(options: {
  executable: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}): OwnedProcessTree;
export function waitForOwnedProcessTree(
  child: OwnedProcessTree,
  options?: { signal?: AbortSignal; timeoutMs?: number; cleanupTimeoutMs?: number },
): Promise<{
  outcome?: { exitCode: number | null; signal: NodeJS.Signals | null };
  executionFailure?: { kind: "start" | "abort" | "deadline"; error: unknown };
  cleanupFailure?: unknown;
}>;
