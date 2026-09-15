#!/bin/sh
set -eu

IAM_API_OIDC_CURRENT_JWK_JSON="$(bun -e '
  const { generateKeyPairSync } = require("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  console.log(JSON.stringify({
    ...privateKey.export({ format: "jwk" }),
    kid: "e2e-runtime-rs256",
    alg: "RS256",
    use: "sig",
  }));
')"
export IAM_API_OIDC_CURRENT_JWK_JSON

exec bun src/index.ts
