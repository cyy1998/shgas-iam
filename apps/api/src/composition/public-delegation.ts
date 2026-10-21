import type { PublicDelegationDependencies } from "@api/routes/public/delegation/delegation.handlers";
import type { DbClient } from "@iam/db";
import { users } from "@iam/db/schema";
import type { DelegationService } from "@iam/delegation";
import { eq } from "drizzle-orm";

/** The public middleware already owns Subject Access; this reader only maps the permitted identity. */
export function createPublicDelegationDependencies(
  db: DbClient,
  delegation: DelegationService,
): PublicDelegationDependencies {
  return {
    delegation,
    resolveAccount: async (subjectIdentifier) =>
      (
        await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(eq(users.subjectIdentifier, subjectIdentifier))
      )[0] ?? null,
  };
}
