#!/bin/sh
set -eu

IAM_OIDC_PROVIDER_CURRENT_JWK_JSON="$(node -e '
  const { generateKeyPairSync } = require("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  console.log(JSON.stringify({
    ...privateKey.export({ format: "jwk" }),
    kid: "e2e-runtime-rs256",
    alg: "RS256",
    use: "sig",
  }));
')"
export IAM_OIDC_PROVIDER_CURRENT_JWK_JSON

exec node --import tsx src/index.ts
