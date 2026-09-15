export interface CanonicalOriginContract {
  adminClientCode: string;
  canonicalOrigin: string;
  runId: string;
}

const contractError
  = "rendered Compose configuration does not use the canonical origin contract";

export function assertCanonicalOriginComposeConfig(
  renderedConfig: unknown,
  contract: CanonicalOriginContract,
) {
  const authority = new URL(contract.canonicalOrigin).host;
  const expected = [
    ["services.api.environment.IAM_API_SSO_INTERNAL_ORIGIN", contract.canonicalOrigin],
    ["services.api.environment.IAM_API_SSO_EXTERNAL_ORIGIN", contract.canonicalOrigin],
    ["services.api.environment.IAM_API_OIDC_ISSUER", `${contract.canonicalOrigin}/oidc`],
    ["services.api.environment.IAM_API_OIDC_PUBLIC_ORIGIN", contract.canonicalOrigin],
    ["services.gateway-sync.environment.IAM_SSO_INTERNAL_HOST", authority],
    ["services.gateway-sync.environment.IAM_SSO_EXTERNAL_HOST", authority],
    ["services.admin-api.environment.IAM_ADMIN_API_ADMIN_CLIENT_CODES", contract.adminClientCode],
    ["services.admin.build.args.UMI_APP_ADMIN_CLIENT_CODE", contract.adminClientCode],
    ["services.seed.environment.IAM_E2E_RUN_ID", contract.runId],
    ["services.seed.environment.IAM_E2E_ORIGIN", contract.canonicalOrigin],
    ["services.seed.environment.IAM_E2E_SEED_RECEIPT_PATH", `/artifacts/${contract.runId}/seed-receipt.json`],
  ] as const;

  for (const [path, value] of expected) {
    if (readStringPath(renderedConfig, path) !== value)
      throw new Error(contractError);
  }
}

function readStringPath(value: unknown, path: string): string | undefined {
  let current = value;
  for (const segment of path.split(".")) {
    if (!isRecord(current))
      return undefined;
    current = current[segment];
  }
  return typeof current === "string" ? current : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
