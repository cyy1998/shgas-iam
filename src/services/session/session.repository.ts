import type { PrismaTransaction } from "@/db";
import type { UserDetailDto } from "@/schemas/user.common.type";
import { prisma } from "@/db";

export async function loginLog(userDetailDto: UserDetailDto, clientCode: string, loginType: string, tx: PrismaTransaction = prisma) {
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
