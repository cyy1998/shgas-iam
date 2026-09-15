import { Buffer } from "node:buffer";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { z } from "zod";

const rsaPrivateJwk = z.object({
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
});
export interface OidcSigningPort {
  sign: (claims: Record<string, unknown>) => Promise<string>;
  jwks: () => { keys: Array<{ kty: "RSA"; kid: string; alg: "RS256"; use: "sig"; n: string; e: string }> };
}
export interface OidcHintVerificationPort {
  verifyLogoutHint: (
    token: string,
    issuer: string,
  ) => Promise<{ clientId: string; subjectIdentifier: string }>;
}

/** Existing server-owned current/previous JSON configuration; only current ever signs. */
export function createOidcSigningKeys(options: {
  currentJwkJson: string;
  previousJwkJson?: string;
}): OidcSigningPort & OidcHintVerificationPort {
  function load(json: string) {
    const jwk = rsaPrivateJwk.parse(JSON.parse(json));
    const key = createPrivateKey({ key: jwk, format: "jwk" });
    const publicKey = createPublicKey(key).export({ format: "jwk" });
    return {
      key,
      public: {
        kty: "RSA" as const,
        kid: jwk.kid,
        alg: "RS256" as const,
        use: "sig" as const,
        n: publicKey.n!,
        e: publicKey.e!,
      },
    };
  }
  const current = load(options.currentJwkJson);
  const previous = options.previousJwkJson ? load(options.previousJwkJson) : undefined;
  if (previous?.public.kid === current.public.kid)
    throw new Error("OIDC signing keys must have unique kid values");
  return {
    async verifyLogoutHint(token, issuer) {
      if (token.length > 32768 || !/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(token))
        throw new Error("Invalid ID Token hint");
      const [header, payload, signature] = token.split(".");
      const parsedHeader = z
        .object({
          alg: z.literal("RS256"),
          kid: z.string().min(1),
          crit: z.never().optional(),
          b64: z.literal(true).optional(),
        })
        .parse(JSON.parse(Buffer.from(header!, "base64url").toString("utf8")));
      const key = [current, previous].find(value => value?.public.kid === parsedHeader.kid);
      if (
        !key
        || !verify(
          "RSA-SHA256",
          Buffer.from(`${header}.${payload}`),
          createPublicKey(key.key),
          Buffer.from(signature!, "base64url"),
        )
      ) {
        throw new Error("Invalid ID Token hint signature");
      }
      // Logout deliberately accepts expired ID Tokens, as the previous Provider did.
      const claims = z
        .object({
          iss: z.literal(issuer),
          aud: z.string().min(1),
          sub: z.string().min(1),
          exp: z.number().int(),
          iat: z.number().int(),
          nbf: z.number().optional(),
          azp: z.string().optional(),
        })
        .parse(JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")));
      if (
        (claims.nbf !== undefined && claims.nbf > Date.now() / 1000 + 15)
        || (claims.azp !== undefined && claims.azp !== claims.aud)
      ) {
        throw new Error("Invalid ID Token hint claims");
      }
      return { clientId: claims.aud, subjectIdentifier: claims.sub };
    },
    async sign(claims) {
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const input = `${encode({ alg: "RS256", kid: current.public.kid, typ: "JWT" })}.${encode(claims)}`;
      return `${input}.${sign("RSA-SHA256", Buffer.from(input), current.key).toString("base64url")}`;
    },
    jwks: () => ({ keys: [current, ...(previous ? [previous] : [])].map(value => ({ ...value.public })) }),
  };
}
