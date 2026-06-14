import { UserStatus } from "@iam/contracts";
import { db } from "@iam/db";
import { users } from "@iam/db/schema";
import { OidcAccountDtoSchema } from "@iam/domain/user";
import { and, eq } from "drizzle-orm";
import { isOidcAccountAvailable } from "./availability.ts";

export class OidcAccountRepository {
  async findBySubject(subject: string) {
    const [row] = await db.select({
      id: users.id,
      oidcSubject: users.oidcSubject,
      username: users.username,
      name: users.name,
      mobile: users.mobile,
      status: users.status,
      isDelete: users.isDelete,
    }).from(users).where(and(
      eq(users.oidcSubject, subject),
      eq(users.status, UserStatus.Enable),
      eq(users.isDelete, false),
    )).limit(1);
    if (!row)
      return null;
    const account = OidcAccountDtoSchema.parse(row);
    return isOidcAccountAvailable(account) ? account : null;
  }

  async findById(id: number) {
    const [row] = await db.select({
      id: users.id,
      oidcSubject: users.oidcSubject,
      username: users.username,
      name: users.name,
      mobile: users.mobile,
      status: users.status,
      isDelete: users.isDelete,
    }).from(users).where(and(
      eq(users.id, id),
      eq(users.status, UserStatus.Enable),
      eq(users.isDelete, false),
    )).limit(1);
    if (!row)
      return null;
    const account = OidcAccountDtoSchema.parse(row);
    return isOidcAccountAvailable(account) ? account : null;
  }
}
