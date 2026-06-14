import assert from "node:assert/strict";
import { exportJWK, generateKeyPair } from "jose";
import { describe, it } from "vitest";
import { loadSigningKeys } from "../security/signing-keys.ts";

async function createPrivateJwk(kid: string) {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return JSON.stringify({
    ...await exportJWK(privateKey),
    kid,
    alg: "RS256",
    use: "sig",
  });
}

describe("oIDC signing keys", () => {
  it("loads current and previous RSA private keys", async () => {
    const keys = await loadSigningKeys(await createPrivateJwk("current"), await createPrivateJwk("previous"));
    assert.equal(keys.current.jwk.kid, "current");
    assert.equal(keys.previous?.jwk.kid, "previous");
  });

  it("rejects duplicate kid values", async () => {
    await assert.rejects(
      loadSigningKeys(await createPrivateJwk("shared"), await createPrivateJwk("shared")),
      /unique kid values/,
    );
  });

  it("rejects public-only key material", async () => {
    const { publicKey } = await generateKeyPair("RS256", { extractable: true });
    const publicJwk = JSON.stringify({
      ...await exportJWK(publicKey),
      kid: "public",
      alg: "RS256",
      use: "sig",
    });
    await assert.rejects(loadSigningKeys(publicJwk), /Invalid input/);
  });
});
