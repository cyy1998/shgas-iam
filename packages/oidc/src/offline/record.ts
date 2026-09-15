import { z } from "zod";
import { OidcClaimsSnapshotSchema } from "./claims-snapshot";

const text = z.string().min(1).max(4096);
const time = z.number().int().nonnegative().safe();
const claims = z
  .object({
    id_token: z
      .object({
        auth_time: z
          .object({ essential: z.literal(true) })
          .strict()
          .optional(),
        acr: z
          .object({ values: z.array(z.string()) })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const common = {
  jti: text,
  iat: time,
  exp: time,
  oidcConfigVersions: z.record(z.string(), time).optional(),
};
const client = { clientId: text, oidcConfigVersion: time };
const auth = {
  accountId: z.uuid(),
  authTime: time,
  acr: z.string().optional(),
  amr: z.array(z.string()).optional(),
};
const bound = {
  grantId: text,
  sessionUid: text,
  scope: text,
  sid: text.optional(),
  expiresWithSession: z.boolean().optional(),
};
const openid = z.object({ scope: z.string().optional(), claims: z.array(z.string()).optional() }).strict();
const result = z
  .object({
    login: z
      .object({ accountId: z.uuid(), ts: time, amr: z.array(z.string()) })
      .strict()
      .optional(),
    error: z.literal("login_required").optional(),
  })
  .strict();
const params = z
  .object(
    Object.fromEntries(
      [
        "acr_values",
        "claims_locales",
        "client_id",
        "code_challenge",
        "code_challenge_method",
        "display",
        "id_token_hint",
        "login_hint",
        "max_age",
        "nonce",
        "prompt",
        "redirect_uri",
        "registration",
        "request",
        "request_uri",
        "response_mode",
        "response_type",
        "scope",
        "state",
        "ui_locales",
      ].map(key => [key, z.string().optional()]),
    ),
  )
  .strict();

/** Frozen opaque Provider 9.9.1 source shapes. Only this offline entrypoint consumes these records. */
const model = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      ...client,
      ...auth,
      ...bound,
      kind: z.literal("AuthorizationCode"),
      redirectUri: text,
      codeChallenge: text,
      codeChallengeMethod: z.literal("S256"),
      claimsSnapshot: OidcClaimsSnapshotSchema,
      nonce: z.string().optional(),
      authorizationAttemptId: text.optional(),
      claims: claims.optional(),
      consumed: time.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      ...client,
      ...bound,
      kind: z.literal("AccessToken"),
      accountId: z.uuid(),
      gty: z.literal("authorization_code"),
      kernelCredentialId: text,
      extra: z
        .object({ claimsSnapshot: OidcClaimsSnapshotSchema, authTime: time, kernelCredentialId: text })
        .strict(),
      claims: claims.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      ...client,
      kind: z.literal("Grant"),
      accountId: z.uuid(),
      openid: openid.optional(),
      resources: z.record(z.string(), z.string()).optional(),
      rejected: z
        .object({ openid: openid.optional(), resources: z.record(z.string(), z.string()).optional() })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("Session"),
      uid: text,
      accountId: z.uuid().optional(),
      acr: z.string().optional(),
      amr: z.array(z.string()).optional(),
      loginTs: time.optional(),
      transient: z.boolean().optional(),
      authorizations: z
        .record(z.string(), z.object({ sid: text.optional(), grantId: text.optional() }).strict())
        .optional(),
      state: z
        .object({
          secret: text,
          clientId: text.optional(),
          postLogoutRedirectUri: z.string().optional(),
          state: z.string().optional(),
        })
        .strict()
        .optional(),
      kernelPrincipalSessionId: text.optional(),
      providerSessionAnchorGeneration: text.optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("Interaction"),
      returnTo: text,
      params,
      prompt: z
        .object({
          name: z.literal("login"),
          reasons: z.array(z.literal("iam_global_session")),
          details: z
            .object({
              max_age: z.string().optional(),
              login_hint: z.string().optional(),
              id_token_hint: z.string().optional(),
            })
            .strict(),
        })
        .strict(),
      cid: text.optional(),
      grantId: text.optional(),
      trusted: z.array(z.string()).optional(),
      session: z
        .object({
          accountId: z.uuid(),
          uid: text.optional(),
          cookie: text.optional(),
          acr: z.string().optional(),
          amr: z.array(z.string()).optional(),
        })
        .strict()
        .optional(),
      result: result.optional(),
      lastSubmission: result.optional(),
      clientId: text.optional(),
      oidcConfigVersion: time.optional(),
    })
    .strict(),
]);

export function decodeOfflineProviderModel(key: string, raw: string) {
  const value = model.parse(JSON.parse(raw));
  if (key !== `oidc:model:${value.kind}:${value.jti}` || value.exp < value.iat)
    throw new Error("Offline Provider identity mismatch");
  if (
    "clientId" in value
    && value.clientId
    && value.oidcConfigVersions
    && value.oidcConfigVersions[value.clientId] !== value.oidcConfigVersion
  ) {
    throw new Error("Offline Provider configuration mismatch");
  }
  if (value.kind === "AuthorizationCode" || value.kind === "AccessToken") {
    const snapshot = value.kind === "AuthorizationCode" ? value.claimsSnapshot : value.extra.claimsSnapshot;
    if (
      snapshot.subjectIdentifier !== value.accountId
      || snapshot.clientId !== value.clientId
      || snapshot.oidcConfigVersion !== value.oidcConfigVersion
      || snapshot.providerSessionUid !== value.sessionUid
    ) {
      throw new Error("Offline Provider Snapshot mismatch");
    }
  }
  if (value.kind === "AccessToken" && value.kernelCredentialId !== value.extra.kernelCredentialId)
    throw new Error("Offline Provider Credential mismatch");
  return value;
}

const anchor = z.object({ accountId: z.uuid(), principalSessionId: text, generation: text }).strict();
const staged = z
  .object({
    accountId: z.uuid(),
    authorizationAttemptId: text,
    authTime: time,
    clientCode: text,
    expectedAnchorGeneration: text.nullable(),
    expiresAt: time,
    oidcConfigVersion: time,
    principalSessionId: text,
    providerSessionUid: text.nullable(),
  })
  .strict();
const lookup = z.object({ bindingId: text, mappingOwnerId: text.optional() }).strict();

export function decodeOfflineProviderSession(key: string, raw: string) {
  if (key.startsWith("oidc:provider-session-principal:")) {
    decodeParts(key.slice("oidc:provider-session-principal:".length), 1);
    anchor.parse(JSON.parse(raw));
  }
  else if (key.startsWith("oidc:provider-session-binding-lookup:")) {
    decodeParts(key.slice("oidc:provider-session-binding-lookup:".length), 2);
    lookup.parse(JSON.parse(raw));
  }
  else if (key.startsWith("oidc:pending-provider-session-binding:")) {
    const value = staged.parse(JSON.parse(raw));
    if (key !== `oidc:pending-provider-session-binding:${encodeURIComponent(value.authorizationAttemptId)}`)
      throw new Error("Offline Provider attempt mismatch");
  }
  else {
    throw new Error("Unknown offline Provider state");
  }
}

export function decodeParts(value: string, count: number) {
  const parts = value.split(":");
  if (
    parts.length !== count
    || parts.some(part => !part || encodeURIComponent(decodeURIComponent(part)) !== part)
  ) {
    throw new Error("Unknown offline Provider key identity");
  }
}
