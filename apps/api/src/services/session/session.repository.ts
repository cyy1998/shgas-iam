import type { DbClient } from "@api/db";
import type { UserDetailDto } from "../user/user.type";
import db from "@api/db";
import { loginLogs } from "@api/db/schema";

export async function loginLog(
  userDetailDto: UserDetailDto,
  clientCode: string,
  loginType: string,
  tx: DbClient = db,
) {
  await tx.insert(loginLogs).values({
    userId: userDetailDto.id,
    username: userDetailDto.username,
    name: userDetailDto.name,
    clientCode,
    loginType,
  });
}
