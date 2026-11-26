import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
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

export function isTransientGhFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
  const message = stderr || error.message;
  if (/\bHTTP(?:\/\d(?:\.\d)?)? 4\d\d\b|validation failed|permission denied|not authorized/i.test(message)) {
    return false;
  }
  return (
    hasCode(error, "ECONNRESET") ||
    hasCode(error, "ETIMEDOUT") ||
    /\bHTTP(?:\/\d(?:\.\d)?)? 50[0234]\b|\b500 Internal Server Error\b|\b502 Bad Gateway\b|\b503 Service Unavailable\b|\b504 Gateway Timeout\b/i.test(
      message,
    ) ||
    /connection reset(?: by peer)?\b/i.test(message) ||
    /(?:^|:\s+)(?:unexpected )?EOF\s*$/m.test(message)
  );
}

export async function retryGhRead<T>(
  read: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 100;
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= maxAttempts - 1 || !isTransientGhFailure(error)) throw error;
      if (baseDelayMs > 0) await delay(baseDelayMs * 2 ** attempt);
    }
  }
}
