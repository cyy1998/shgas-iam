export type OwnedCommandOptions = {
  executable: string;
  args?: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  cleanupTimeoutMs?: number;
  inheritOutput?: boolean;
  logFile?: string;
};
export type OwnedCommandResult = { exitCode: number; signal: NodeJS.Signals | null; output: string };
export function runOwnedCommand(options: OwnedCommandOptions): Promise<OwnedCommandResult>;
export function pnpmCommand(pnpmCli: string, args: readonly string[]): { executable: string; args: readonly string[] };
