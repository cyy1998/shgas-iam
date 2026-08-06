import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";

export interface OidcCallbackExpectation {
  redirectUri: string;
  state: string;
}

export function deriveS256CodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function createPkceS256Pair(
  generateBytes: (size: number) => Uint8Array = randomBytes,
) {
  const verifier = Buffer.from(generateBytes(32)).toString("base64url");
  return {
    verifier,
    challenge: deriveS256CodeChallenge(verifier),
  };
}

export function receiveOidcAuthorizationCallback(
  callbackUrl: string,
  expectation: OidcCallbackExpectation,
) {
  const callback = new URL(callbackUrl);
  const registered = new URL(expectation.redirectUri);
  if (callback.origin !== registered.origin
    || callback.pathname !== registered.pathname
    || callback.username !== registered.username
    || callback.password !== registered.password) {
    throw new Error("OIDC authorization did not reach the registered OIDC callback");
  }
  if (callback.searchParams.get("state") !== expectation.state)
    throw new Error("OIDC callback state did not match the RP request");
  const error = callback.searchParams.get("error");
  if (error !== null)
    throw new Error(`OIDC callback returned ${error}`);
  const code = callback.searchParams.get("code");
  if (!code)
    throw new Error("OIDC callback did not contain an authorization code");
  return { code };
}
