import type { DbClient } from "@iam/db";
import { users } from "@iam/db/schema";
import { OidcAccountDtoSchema } from "@iam/domain/user";
import { eq } from "drizzle-orm";

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
      }).from(users).where(eq(users.subjectIdentifier, subject)).limit(1);
      return row ? OidcAccountDtoSchema.parse(row) : null;
    },
  };
}

export type OidcAccountRepository = ReturnType<typeof createOidcAccountRepository>;
