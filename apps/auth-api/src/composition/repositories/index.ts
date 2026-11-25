import { createClientRepository } from "@auth-api/services/client/client.repository";
import { createUserRepository } from "@auth-api/services/user/user.repository";
import type { DbClient } from "@iam/db";
import { createAuditRepository } from "@iam/db/audit";
import { createUserDocumentQueryRepository } from "@iam/documents/user/query/repository";

export function createAuthApiRepositories(db: DbClient) {
  return {
    audit: createAuditRepository(db),
    client: createClientRepository(db),
    user: createUserRepository(db),
    userDocument: createUserDocumentQueryRepository(db),
  };
}

export type AuthApiRepositories = ReturnType<typeof createAuthApiRepositories>;
