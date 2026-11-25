import { UserStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { extractPostgresError } from "@iam/db/postgres-error";
import { firstRow } from "@iam/db/query-utils";
import { USER_MOBILE_UNIQUE_INDEX, users } from "@iam/db/schema";
import {
  MobileAlreadyExistsError,
  normalizeRegisteredIdentifier,
  type UserCreateDto,
  UsernameAlreadyExistsError,
} from "@iam/domain/user";
import { sql } from "drizzle-orm";

export function createUserRepository(db: DbClient) {
  return {
    async lockPurveyorContactMobile(mobile: string) {
      await db.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`iam:purveyor-contact:${mobile}`}, 0::bigint)
        )
      `);
    },
    async getUserByMobile(mobile: string) {
      const registeredMobile = normalizeRegisteredIdentifier(mobile);
      if (registeredMobile === null) return null;
      return (
        (await db.query.users.findFirst({
          where: {
            mobile: registeredMobile,
            status: UserStatus.Enable,
            isDelete: false,
          },
        })) ?? null
      );
    },
    async setUser(userCreateDto: UserCreateDto & { subjectIdentifier: string }) {
      try {
        return firstRow(await db.insert(users).values(userCreateDto).returning())!;
      } catch (error) {
        const detail = extractPostgresError(error);
        if (
          detail?.code === "23505" &&
          (detail.constraint === "user_username_key" || detail.constraint === "user_username_unique")
        ) {
          throw new UsernameAlreadyExistsError();
        }
        if (detail?.code === "23505" && detail.constraint === USER_MOBILE_UNIQUE_INDEX) {
          throw new MobileAlreadyExistsError();
        }
        throw error;
      }
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
