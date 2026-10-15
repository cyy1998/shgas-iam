import { expect, test } from "bun:test";
import { signingKeys } from "@api/testing/oidc-signing.fixture";
import { createOidcSigningKeys } from "@iam/oidc";

test("OIDC signing rejects public-only or duplicate-kid configuration and supports current-only", () => {
  const current = signingKeys("one");
  const signer = createOidcSigningKeys({ currentJwkJson: current });
  expect(signer.jwks().keys).toHaveLength(1);
  expect(() => createOidcSigningKeys({ currentJwkJson: current, previousJwkJson: current })).toThrow();
  expect(() => createOidcSigningKeys({ currentJwkJson: JSON.stringify(signer.jwks().keys[0]) })).toThrow();
});
