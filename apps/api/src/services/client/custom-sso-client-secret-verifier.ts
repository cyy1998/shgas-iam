import type { SubjectClaimName } from "@iam/contracts";
import type { CustomSsoClientSecretRecord } from "@iam/domain/client";
import { verifySecret } from "@iam/api-core/security";
import { ClientStatus, CustomSsoClientMode } from "@iam/contracts";

export interface CustomSsoClientSecretReader {
  findSecretRecord: (clientCode: string) => Promise<CustomSsoClientSecretRecord | null>;
}

export interface CreateCustomSsoClientSecretVerifierDeps {
  repository: CustomSsoClientSecretReader;
}

export interface AuthenticatedIndependentCustomSsoClient {
  readonly clientCode: string;
  readonly configVersion: number;
  readonly subjectClaimCatalogVersion: 1;
  readonly subjectClaims: readonly SubjectClaimName[];
}

export function createCustomSsoClientSecretVerifier(
  deps: CreateCustomSsoClientSecretVerifierDeps,
) {
  async function authenticate(
    clientCode: string,
    secret: string,
  ): Promise<AuthenticatedIndependentCustomSsoClient | null> {
    const record = await deps.repository.findSecretRecord(clientCode);
    if (
      !record
      || record.clientCode !== clientCode
      || record.status === ClientStatus.Disable
      || record.isDelete
      || !record.customSsoEnabled
      || record.customSsoConfig?.mode !== CustomSsoClientMode.Independent
      || !record.customSsoSecretHash
      || !(await verifySecret(secret, record.customSsoSecretHash))
    ) {
      return null;
    }
    return {
      clientCode: record.clientCode,
      configVersion: record.customSsoConfigVersion,
      subjectClaimCatalogVersion: record.customSsoConfig.subjectClaimCatalogVersion,
      subjectClaims: [...record.customSsoConfig.subjectClaims],
    };
  }

  return {
    authenticate,
  };
}

export type CustomSsoClientSecretVerifier = ReturnType<
  typeof createCustomSsoClientSecretVerifier
>;
