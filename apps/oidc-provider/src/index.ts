import { SystemLogEvent } from "@iam/api-core/logger";
import { parseOidcProviderEnv } from "./env.ts";

async function main() {
  const env = parseOidcProviderEnv(process.env);
  const { createOidcProviderComposition } = await import("./composition/index.ts");
  const composition = await createOidcProviderComposition({ env });

  composition.server.listen(env.port, () => {
    composition.logger.info({
      event: SystemLogEvent.OidcProviderStarted,
      issuer: env.oidc.issuer,
      port: env.port,
    }, "OIDC provider listening");
  });

  process.once("SIGINT", () => void composition.shutdown("SIGINT"));
  process.once("SIGTERM", () => void composition.shutdown("SIGTERM"));
}

void main();
