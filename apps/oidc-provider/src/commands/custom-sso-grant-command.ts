import type Redis from "ioredis";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createCustomSsoGrantMaintenance, createCustomSsoGrantVerifier } from "../composition/session/custom-sso-grant-maintenance.ts";
import { createMaintenanceRedis } from "../storage/maintenance-redis.ts";

const commandEnvSchema = z.object({
  IAM_OIDC_PROVIDER_REDIS_HOST: z.string().trim().min(1),
  IAM_OIDC_PROVIDER_REDIS_PORT: z.coerce.number().int().min(1).max(65535),
  IAM_OIDC_PROVIDER_REDIS_DB: z.coerce.number().int().nonnegative(),
  IAM_OIDC_PROVIDER_REDIS_PASSWORD: z.string().optional(),
  IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE: z.string().trim().min(1).regex(/^[^*?[\]\\]+$/),
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
    const operation = z.enum(["inventory", "apply", "verify"]).parse(args[0]);
    if (args.length !== 2 || args[1] !== "--writers-stopped")
      throw new Error("Explicit stopped writers required");
    const env = commandEnvSchema.parse(process.env);
    redis = createMaintenanceRedis({
      host: env.IAM_OIDC_PROVIDER_REDIS_HOST,
      port: env.IAM_OIDC_PROVIDER_REDIS_PORT,
      db: env.IAM_OIDC_PROVIDER_REDIS_DB,
      password: env.IAM_OIDC_PROVIDER_REDIS_PASSWORD,
    });
    await redis.connect();
    const options = { kernelNamespace: env.IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE, writersStopped: true, signal: controller.signal };
    const report = operation === "apply"
      ? await createCustomSsoGrantMaintenance({ ...options, redis: { scan: redis.scan.bind(redis), get: redis.get.bind(redis), eval: redis.eval.bind(redis) } }).apply()
      : await createCustomSsoGrantVerifier({ ...options, redis: { scan: redis.scan.bind(redis), get: redis.get.bind(redis) } })[operation]();
    failed = report.status !== "passed";
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  catch {
    failed = true;
    process.stdout.write(`${JSON.stringify({ status: "failed", failed: 1, unverified: true, preservation: "requires_independent_baseline_comparison" })}\n`);
  }
  finally {
    try {
      if (redis?.status === "ready")
        await redis.quit();
    }
    catch {
      failed = true;
      process.stderr.write("Custom SSO Grant maintenance shutdown failed. Keep writers stopped.\n");
    }
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
