import type { DbClient } from "@iam/db";
import db from "@iam/db";
import { createOidcAccountRepository } from "../../repositories/account.repository.ts";
import { createOidcAuthorizationRepository } from "../../repositories/authorization.repository.ts";
import { createOidcClientRepository } from "../../repositories/client.repository.ts";

export function createOidcProviderRepositories(client: DbClient = db) {
  return {
    account: createOidcAccountRepository(client),
    authorization: createOidcAuthorizationRepository(client),
    client: createOidcClientRepository(client),
  };
}

export type OidcProviderRepositories = ReturnType<typeof createOidcProviderRepositories>;
