import process from "node:process";
import { createAdminApiComposition } from "../src/composition";

async function runCompositionSmoke() {
  const composition = await createAdminApiComposition();
  try {
    await composition.runtime.integrations.clientCache.invalidateClient({
      clientCode: "alpha",
      clientSecret: "alpha-secret",
    });
    await composition.runtime.integrations.clientCache.invalidateUpdatedClient(
      {
        clientCode: "before",
        clientSecret: "before-secret",
      },
      {
        clientCode: "after",
        clientSecret: "after-secret",
      },
    );
  }
  finally {
    await composition.userProfileQueue.close();
    composition.runtime.redis.disconnect();
  }
  process.stdout.write("CLIENT_CACHE_INVALIDATION_OK\n");
}

runCompositionSmoke().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
