import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX } from "./grant/redis-store";

/** Select only generations preceding this explicit command's committed boundary. */
export function createCustomSsoRevocationSelector(committedVersion: number) {
  if (!Number.isSafeInteger(committedVersion) || committedVersion < 0)
    throw new RangeError("Custom SSO revocation requires a committed configuration version");
  return {
    metadataFields: ["configVersion"] as const,
    select(object: { readonly metadata: Readonly<Record<string, unknown>> }) {
      const version = object.metadata.configVersion;
      if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)
        return "unconfirmed" as const;
      return version < committedVersion ? "select" as const : "retain" as const;
    },
  };
}

export function customSsoMaintenancePrefixes(): readonly string[] {
  return [AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX];
}

export { createLegacyGrantMaintenance, createLegacyGrantVerifier } from "./grant/inventory-maintenance";
export { decodeCustomSsoLegacyGrant, isCustomSsoAuthorizationArtifact } from "./grant/maintenance";
