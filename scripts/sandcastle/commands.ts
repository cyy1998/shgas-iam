import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function command(file: string, args: string[], cwd: string, timeout = 60_000): Promise<string> {
  try {
    const result = await exec(file, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    return result.stdout.trim();
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${file} 执行失败：${detail.slice(-6000)}`, { cause: error });
  }
}
