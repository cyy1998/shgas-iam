import type { DbClient } from "@iam/db";
import { UserStatus } from "@iam/contracts";
import { users } from "@iam/db/schema";
import { OidcAccountDtoSchema } from "@iam/domain/user";
import { and, eq } from "drizzle-orm";
import { isOidcAccountAvailable } from "./availability.ts";

export function createOidcAccountRepository(db: DbClient) {
  return {
    async findBySubject(subject: string) {
      const [row] = await db.select({
        id: users.id,
        subjectIdentifier: users.subjectIdentifier,
        username: users.username,
        name: users.name,
        mobile: users.mobile,
        status: users.status,
        isDelete: users.isDelete,
      }).from(users).where(and(
        eq(users.subjectIdentifier, subject),
        eq(users.status, UserStatus.Enable),
        eq(users.isDelete, false),
      )).limit(1);
      if (!row)
        return null;
      const account = OidcAccountDtoSchema.parse(row);
      return isOidcAccountAvailable(account) ? account : null;
    },
  };
}

export type OidcAccountRepository = ReturnType<typeof createOidcAccountRepository>;
