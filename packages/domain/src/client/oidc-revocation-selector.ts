/** OIDC metadata interpretation shared by explicit management consumers. */
export function createOidcRevocationSelector(committedVersion: number) {
  if (!Number.isSafeInteger(committedVersion) || committedVersion < 0)
    throw new RangeError("OIDC revocation requires a committed configuration version");
  return {
    metadataFields: ["oidcConfigVersion"] as const,
    select(object: { readonly metadata: Readonly<Record<string, unknown>> }) {
      const version = object.metadata.oidcConfigVersion;
      if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)
        return "unconfirmed" as const;
      return version < committedVersion ? "select" as const : "retain" as const;
    },
  };
}
