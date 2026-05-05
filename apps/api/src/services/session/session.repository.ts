import type { PrismaTransaction } from "@api/db";
import type { UserDetailDto } from "../user/user.type";
import { prisma } from "@api/db";

export async function loginLog(
  userDetailDto: UserDetailDto,
  clientCode: string,
  loginType: string,
  tx: PrismaTransaction = prisma,
) {
  await tx.loginLog.create({
    data: {
      userId: userDetailDto.id,
      username: userDetailDto.username,
      name: userDetailDto.name,
      clientCode,
      loginType,
    },
  });
}
