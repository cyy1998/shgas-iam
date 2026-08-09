import { startOidcProviderApplication } from "./application.ts";
import { parseOidcProviderEnv } from "./env.ts";

async function main() {
  const env = parseOidcProviderEnv(process.env);
  const { createOidcProviderComposition } = await import("./composition/index.ts");
  const composition = await createOidcProviderComposition({ env });
  startOidcProviderApplication({
    composition,
    env: {
      issuer: env.oidc.issuer,
      port: env.port,
    },
  });
}

void main();
