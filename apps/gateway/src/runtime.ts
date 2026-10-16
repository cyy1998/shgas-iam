import { createGatewayComposition } from "./composition";
import type { GatewayEnv } from "./env";

export async function startGatewayRuntime(env: GatewayEnv) {
  const composition = createGatewayComposition(env);
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: env.hostname,
      port: env.port,
      development: false,
      idleTimeout: 0,
      // The HTTP adapter enforces the configured (at most 16 MiB) bound while
      // streaming. Keep the transport ceiling higher so it can return the envelope.
      maxRequestBodySize: 128 * 1024 * 1024,
      fetch: composition.app.fetch,
    });
  } catch (error) {
    await composition.close();
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    port: server.port,
    close() {
      composition.lifecycle.beginShutdown();
      closing ??= (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            Promise.all([server.stop(false), composition.close()]),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(
                () => reject(new Error("Gateway shutdown deadline exceeded; operation outcome may be unknown")),
                env.shutdownTimeoutMs,
              );
            }),
          ]);
        } catch (error) {
          await server.stop(true);
          throw error;
        } finally {
          clearTimeout(timer);
        }
      })();
      return closing;
    },
  };
}
