import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const reportSchema = z.object({ version: z.literal(1), status: z.literal("completed") }).passthrough();
const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

/** Each verification runs in a fresh process. Raw child output is never forwarded. */
export async function runUpgradeCommand(script: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal) {
  signal.throwIfAborted();
  const child = Bun.spawn([process.execPath, "--no-env-file", script, ...args], {
    cwd: workerRoot,
    env,
    stdout: "pipe",
    stderr: "ignore",
  });
  const abort = () => child.kill();
  const timer = setTimeout(abort, 310_000);
  signal.addEventListener("abort", abort, { once: true });
  let size = 0;
  let output = "";
  try {
    const decoder = new TextDecoder();
    for await (const chunk of child.stdout) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        child.kill();
        throw new Error("Command output bound exceeded");
      }
      output += decoder.decode(chunk, { stream: true });
    }
    output += decoder.decode();
    const code = await child.exited;
    signal.throwIfAborted();
    if (code !== 0)
      throw new Error("Upgrade phase failed");
    return reportSchema.parse(JSON.parse(output.trim()));
  }
  finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    child.kill();
    await child.exited;
  }
}
