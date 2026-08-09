import type { OidcProviderComposition } from "./composition/index.ts";
import { SystemLogEvent } from "@iam/api-core/logger";

interface OidcProviderApplicationEnv {
  issuer: string;
  port: number;
}

interface OidcProviderProcessLifecycle {
  once: (event: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
}

interface StartOidcProviderApplicationOptions {
  composition: OidcProviderComposition;
  env: OidcProviderApplicationEnv;
  processLifecycle?: OidcProviderProcessLifecycle;
}

export function startOidcProviderApplication(options: StartOidcProviderApplicationOptions) {
  const { composition, env } = options;
  const processLifecycle = options.processLifecycle ?? process;

  composition.server.once("error", (error) => {
    composition.logger.error({
      event: SystemLogEvent.OidcProviderServerError,
      err: error,
      errorName: error.name,
      errorMessage: error.message,
    }, "OIDC provider HTTP server error");
    void composition.shutdown("server:error");
  });

  composition.server.listen(env.port, () => {
    composition.logger.info({
      event: SystemLogEvent.OidcProviderStarted,
      issuer: env.issuer,
      port: env.port,
    }, "OIDC provider listening");
  });

  processLifecycle.once("SIGINT", () => void composition.shutdown("SIGINT"));
  processLifecycle.once("SIGTERM", () => void composition.shutdown("SIGTERM"));
}
