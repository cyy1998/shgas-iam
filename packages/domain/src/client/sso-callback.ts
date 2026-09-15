/** Complete deployed handler URLs, never routes inferred from a business origin. */
export function createClientSsoCallbackClassifier(options: {
  trustedIamOrigins: readonly string[];
  managedCallbackUrls: readonly string[];
}) {
  const origins = new Set(options.trustedIamOrigins.map(value => new URL(value).origin));
  const managed = new Set(options.managedCallbackUrls.map((value) => {
    const url = new URL(value);
    if (!origins.has(url.origin) || url.username || url.password || url.search || url.hash)
      throw new Error("Managed callback must be an actual handler URL on a trusted IAM origin");
    return url.href;
  }));
  return (value: string) => managed.has(new URL(value).href);
}
