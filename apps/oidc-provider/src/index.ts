import { SystemLogEvent } from "@iam/api-core/logger";
import { createOidcProviderComposition } from "./composition/index.ts";
import { parseOidcProviderEnv } from "./env.ts";

async function main() {
  const env = parseOidcProviderEnv(process.env);
  const composition = await createOidcProviderComposition({ env });

  composition.server.listen(env.PORT, () => {
    composition.logger.info({
      event: SystemLogEvent.OidcProviderStarted,
      issuer: env.OIDC_ISSUER,
      port: env.PORT,
    }, "OIDC provider listening");
  });

  process.once("SIGINT", () => void composition.shutdown("SIGINT"));
  process.once("SIGTERM", () => void composition.shutdown("SIGTERM"));
}

void main();
