import { generateKeyPairSync } from "node:crypto";

export function signingKeys(kid = "current") {
  return JSON.stringify({
    ...generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "jwk" }),
    kid,
    alg: "RS256",
    use: "sig",
  });
}
