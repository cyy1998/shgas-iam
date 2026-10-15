import process from "node:process";
import { createAdminApiRuntime } from "../src/composition/runtime";

async function run() {
  const [mode, code, secret, nextCode, nextSecret] = process.argv.slice(2);
  if (mode !== "update" || !code || !secret || !nextCode || !nextSecret)
    throw new Error("Invalid cache smoke arguments");
  const runtime = createAdminApiRuntime();
  try {
    await runtime.integrations.clientCache.invalidateUpdatedClient(
      { clientCode: code, clientSecret: secret },
      { clientCode: nextCode, clientSecret: nextSecret },
    );
    process.stdout.write("CLIENT_CACHE_INVALIDATION_OK\n");
  } finally {
    runtime.redis.disconnect();
  }
}
run().catch(() => {
  process.stderr.write("Client cache smoke failed\n");
  process.exitCode = 1;
});
