import process from "node:process";
import { createAdminApiRuntime } from "../src/composition/runtime";

type CacheCommand
  = | {
    clientCode: string;
    clientSecret: string;
    mode: "invalidate";
  }
  | {
    clientCode: string;
    mode: "mutation";
    mutationId: string;
  }
  | {
    mode: "update";
    newClientCode: string;
    newClientSecret: string;
    oldClientCode: string;
    oldClientSecret: string;
  };

async function runRuntimeSmoke() {
  const command = parseCommand(process.argv.slice(2));
  const runtime = createAdminApiRuntime();
  try {
    const cache = runtime.integrations.clientCache;
    if (command.mode === "invalidate") {
      await cache.invalidateClient(command);
    }
    else if (command.mode === "update") {
      await cache.invalidateUpdatedClient(
        {
          clientCode: command.oldClientCode,
          clientSecret: command.oldClientSecret,
        },
        {
          clientCode: command.newClientCode,
          clientSecret: command.newClientSecret,
        },
      );
    }
    else {
      const mutation = await cache.beginRuntimeMutation(
        command.clientCode,
        command.mutationId,
      );
      const heartbeat = cache.startRuntimeMutationHeartbeat(mutation);
      await Bun.sleep(100);
      await heartbeat.stopAndSettle(async () =>
        await cache.completeRuntimeMutation(mutation));
    }
  }
  finally {
    runtime.redis.disconnect();
  }
  process.stdout.write("CLIENT_CACHE_INVALIDATION_OK\n");
}

function parseCommand(args: string[]): CacheCommand {
  if (args[0] === "invalidate" && args.length === 3) {
    return {
      mode: "invalidate",
      clientCode: args[1]!,
      clientSecret: args[2]!,
    };
  }
  if (args[0] === "update" && args.length === 5) {
    return {
      mode: "update",
      oldClientCode: args[1]!,
      oldClientSecret: args[2]!,
      newClientCode: args[3]!,
      newClientSecret: args[4]!,
    };
  }
  if (args[0] === "mutation" && args.length === 3) {
    return {
      mode: "mutation",
      clientCode: args[1]!,
      mutationId: args[2]!,
    };
  }
  throw new TypeError("Invalid client cache runtime smoke arguments");
}

runRuntimeSmoke().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
