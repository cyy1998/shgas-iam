import type { OidcClientSecretRecord } from "@iam/domain/client";
import { verifySecret } from "@iam/api-core/security";

export interface OidcClientSecretReader {
  findSecretRecord: (clientCode: string) => Promise<OidcClientSecretRecord | null>;
}

export interface CreateOidcClientSecretVerifierDeps {
  repository: OidcClientSecretReader;
}

export function createOidcClientSecretVerifier(deps: CreateOidcClientSecretVerifierDeps) {
  return {
    async verify(clientCode: string, secret: string) {
      const record = await deps.repository.findSecretRecord(clientCode);
      if (!record)
        return false;
      return record.oidcSecretHash ? await verifySecret(secret, record.oidcSecretHash) : false;
    },
  };
}

export type OidcClientSecretVerifier = ReturnType<typeof createOidcClientSecretVerifier>;
