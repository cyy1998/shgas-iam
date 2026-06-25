import type { JWK } from "jose";
import { importJWK } from "jose";
import { z } from "zod";

const RsaPrivateJwkSchema = z.object({
  kty: z.literal("RSA"),
  kid: z.string().min(1),
  alg: z.literal("RS256"),
  use: z.literal("sig").optional(),
  n: z.string().min(1),
  e: z.string().min(1),
  d: z.string().min(1),
  p: z.string().min(1),
  q: z.string().min(1),
  dp: z.string().min(1),
  dq: z.string().min(1),
  qi: z.string().min(1),
}).passthrough();

export type SigningKey = {
  jwk: JWK & { kid: string; alg: "RS256" };
  key: Awaited<ReturnType<typeof importJWK>>;
};

function parseJwkJson(value: string, name: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  }
  catch {
    throw new Error(`${name} must contain valid JSON`);
  }
  return RsaPrivateJwkSchema.parse(parsed);
}

async function validateSigningKey(value: string, name: string): Promise<SigningKey> {
  const jwk = parseJwkJson(value, name);
  const key = await importJWK(jwk, "RS256");
  if (!("type" in key) || key.type !== "private")
    throw new Error(`${name} must contain an RSA private key`);
  return { jwk, key };
}

export async function loadSigningKeys(currentJson: string, previousJson?: string) {
  const current = await validateSigningKey(currentJson, "current OIDC signing JWK");
  const previous = previousJson
    ? await validateSigningKey(previousJson, "previous OIDC signing JWK")
    : undefined;
  if (previous?.jwk.kid === current.jwk.kid)
    throw new Error("OIDC current and previous signing keys must have unique kid values");
  return { current, previous };
}
