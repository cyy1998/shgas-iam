import type Redis from "ioredis";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { maintainOnlineAuthState } from "../composition/session/online-auth-state-maintenance.ts";
import { createMaintenanceRedis } from "../storage/maintenance-redis.ts";

const commandEnvSchema = z.object({
  IAM_OIDC_PROVIDER_REDIS_HOST: z.string().trim().min(1),
  IAM_OIDC_PROVIDER_REDIS_PORT: z.coerce.number().int().min(1).max(65535),
  IAM_OIDC_PROVIDER_REDIS_DB: z.coerce.number().int().nonnegative(),
  IAM_OIDC_PROVIDER_REDIS_PASSWORD: z.string().optional(),
  IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE: z.string().trim().min(1),
});

async function main() {
  let redis: Redis | undefined;
  let failed = false;
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
    redis?.disconnect();
  };
  const deadline = setTimeout(abort, 300_000);
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const args = process.argv.slice(2).filter(arg => arg !== "--");
    const operation = z.enum(["dry-run", "apply", "verify"]).parse(args[0]);
    if (args.length !== 2 || args[1] !== "--writers-stopped")
      throw new Error("Explicit stopped writers confirmation required");
    const env = commandEnvSchema.parse(process.env);
    redis = createMaintenanceRedis({
      host: env.IAM_OIDC_PROVIDER_REDIS_HOST,
      port: env.IAM_OIDC_PROVIDER_REDIS_PORT,
      db: env.IAM_OIDC_PROVIDER_REDIS_DB,
      password: env.IAM_OIDC_PROVIDER_REDIS_PASSWORD,
    });
    await redis.connect();
    const report = await maintainOnlineAuthState({
      redis,
      kernelNamespace: env.IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE,
      operation,
      writersStopped: true,
      signal: controller.signal,
    });
    failed = report.status !== "passed";
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  catch {
    failed = true;
    process.stderr.write("Online authentication state maintenance failed. Keep traffic stopped.\n");
  }
  finally {
    try {
      if (redis?.status === "ready")
        await redis.quit();
    }
    catch { failed = true; }
    redis?.disconnect();
    clearTimeout(deadline);
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    if (failed || controller.signal.aborted)
      process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1])
  void main();
