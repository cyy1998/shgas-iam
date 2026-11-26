import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function command(
  file: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
  timeout = 60_000,
): Promise<string> {
  const { stdout } = await exec(file, args, { cwd, env, timeout, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

export function hasCode(error: unknown, code: string | number): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
