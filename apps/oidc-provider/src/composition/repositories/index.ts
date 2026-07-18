import type { DbClient } from "@iam/db";
import db from "@iam/db";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { createOidcAccountRepository } from "../../repositories/account.repository.ts";
import { createOidcAuthorizationRepository } from "../../repositories/authorization.repository.ts";
import { createOidcClientRepository } from "../../repositories/client.repository.ts";

export function createOidcProviderRepositories(client: DbClient = db) {
  const roleAssignmentResolver = createRoleAssignmentResolver(client);
  return {
    account: createOidcAccountRepository(client),
    authorization: createOidcAuthorizationRepository(client, roleAssignmentResolver),
    client: createOidcClientRepository(client),
  };
}

export type OidcProviderRepositories = ReturnType<typeof createOidcProviderRepositories>;
