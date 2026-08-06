import { describe, expect, test } from "bun:test";
import { assertCanonicalOriginComposeConfig } from "./origin-contract.ts";

describe("canonical origin rendered configuration", () => {
  test("accepts only one Gateway authority and origin across every participating runtime", () => {
    const contract = {
      runId: "run-origin-01",
      canonicalOrigin: "http://127.0.0.1:43123",
      adminClientCode: "e2e-admin-run-origin-01",
      adminRoleCode: "e2e-role-run-origin-01",
    };
    const rendered = renderedComposeContract(contract);

    expect(() => assertCanonicalOriginComposeConfig(rendered, contract)).not.toThrow();
    rendered.services["oidc-provider"].environment.IAM_OIDC_PROVIDER_ISSUER
      = "http://wrong.test/oidc";
    expect(() => assertCanonicalOriginComposeConfig(rendered, contract)).toThrow(
      "rendered Compose configuration does not use the canonical origin contract",
    );
  });
});

function renderedComposeContract(input: {
  runId: string;
  canonicalOrigin: string;
  adminClientCode: string;
  adminRoleCode: string;
}) {
  const authority = new URL(input.canonicalOrigin).host;
  return {
    services: {
      "api": { environment: {
        IAM_API_SSO_INTERNAL_ORIGIN: input.canonicalOrigin,
        IAM_API_SSO_EXTERNAL_ORIGIN: input.canonicalOrigin,
      } },
      "oidc-provider": { environment: {
        IAM_OIDC_PROVIDER_ISSUER: `${input.canonicalOrigin}/oidc`,
        IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: input.canonicalOrigin,
      } },
      "gateway-sync": { environment: {
        IAM_SSO_INTERNAL_HOST: authority,
        IAM_SSO_EXTERNAL_HOST: authority,
      } },
      "admin-api": { environment: {
        IAM_ADMIN_API_ADMIN_CLIENT_CODES: input.adminClientCode,
        IAM_ADMIN_API_ADMIN_ROLE_CODES: input.adminRoleCode,
      } },
      "admin": { build: { args: {
        UMI_APP_ADMIN_CLIENT_CODE: input.adminClientCode,
        UMI_APP_ADMIN_ROLE_CODE: input.adminRoleCode,
      } } },
      "seed": { environment: {
        IAM_E2E_RUN_ID: input.runId,
        IAM_E2E_ORIGIN: input.canonicalOrigin,
        IAM_E2E_SEED_RECEIPT_PATH: `/artifacts/${input.runId}/seed-receipt.json`,
      } },
    },
  };
}
