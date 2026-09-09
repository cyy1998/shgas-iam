import { z } from "zod";
import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX } from "./redis-store";

const legacyGrantRecordSchema = z.discriminatedUnion("state", [
  z.object({ version: z.literal(1), grantId: z.string(), state: z.literal("issued"), expiresAt: z.number().int().positive() }).strict(),
  z.object({ version: z.literal(1), grantId: z.string(), state: z.literal("consumed"), expiresAt: z.number().int().positive() }).strict(),
  z.object({
    version: z.literal(1),
    grantId: z.string(),
    state: z.literal("redeeming"),
    expiresAt: z.number().int().positive(),
    attemptId: z.string(),
    leaseExpiresAt: z.number().int().positive(),
  }).strict(),
]);

/** Old inventory remains readable after the online lease implementation is retired. */
export function decodeCustomSsoLegacyGrant(key: string, raw: string) {
  if (!key.startsWith(AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX))
    throw new Error("Not a Custom SSO Grant inventory key");
  const grantId = key.slice(AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX.length);
  const record = legacyGrantRecordSchema.parse(JSON.parse(raw));
  if (!grantId || record.grantId !== grantId)
    throw new Error("Custom SSO Grant inventory identity mismatch");
  return record;
}

/** Apply only during the stopped-writer inventory captured before the new deployment. */
export function isCustomSsoAuthorizationArtifact(object: {
  readonly protocol?: string;
  readonly artifactType?: string;
  readonly objectKind?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}) {
  return object.protocol === "custom-sso"
    && (object.artifactType === "auth_code"
      || (object.objectKind === "artifact" && object.metadata?.artifactType === "auth_code"));
}
