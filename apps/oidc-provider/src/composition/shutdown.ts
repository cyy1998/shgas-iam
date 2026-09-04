import { SystemLogEvent } from "@iam/api-core/logger";

interface CreateOidcProviderShutdownOptions {
  closeDatabase: () => Promise<unknown>;
  logger: {
    info: (fields: Record<string, unknown>, message: string) => unknown;
  };
  redis: {
    quit: () => Promise<unknown>;
  };
  server: {
    close: (onClosed: () => void) => unknown;
  };
}

export function createOidcProviderShutdown(options: CreateOidcProviderShutdownOptions) {
  return async function shutdown(signal: string) {
    options.logger.info({
      event: SystemLogEvent.OidcProviderStopping,
      signal,
    }, "OIDC provider shutting down");
    await Promise.allSettled([
      new Promise<void>((resolve) => {
        options.server.close(() => resolve());
      }),
      options.redis.quit(),
      options.closeDatabase(),
    ]);
  };
}
