import type { PrismaTransaction } from '@database/db';
import type { UserAdminQueryDto } from '@schemas/user.admin.type';
import type { UserCreateDto } from '@schemas/user.common.type';
import { prisma } from '@database/db';

export const userAdminRepository = {
  async getUserByUsername(username: string, tx: PrismaTransaction = prisma) {
    return await tx.user.findFirst({
      where: {
        username,
        isDelete: false,
      },
    });
  },
  async searchUsersFuzzy(
    userAdminSearchDto: UserAdminQueryDto,
    tx: PrismaTransaction = prisma,
  ) {
    return await tx.user.findMany({
      where: {
        OR: userAdminSearchDto.conditions.fuzzyConditions.text !== undefined
          ? [
              {
                username: {
                  contains: userAdminSearchDto.conditions.fuzzyConditions.text,
                },
              },
              {
                name: {
                  contains: userAdminSearchDto.conditions.fuzzyConditions.text,
                },
              },
              {
                mobile: {
                  contains: userAdminSearchDto.conditions.fuzzyConditions.text,
                },
              },
              {
                wxId: {
                  contains: userAdminSearchDto.conditions.fuzzyConditions.text,
                },
              },
            ]
          : undefined,
        userType: {
          in: userAdminSearchDto.conditions.exactConditions.userTypes,
        },
        username: {
          in: userAdminSearchDto.conditions.exactConditions.usernames,
        },
        mobile: {
          in: userAdminSearchDto.conditions.exactConditions.phones,
        },
        wxId: {
          in: userAdminSearchDto.conditions.exactConditions.wxIds,
        },
        isDelete: false,
      },
    });
  },
  async setUsers(userCreateDtos: UserCreateDto[], tx: PrismaTransaction = prisma) {
    return await tx.user.createMany({
      data: userCreateDtos,
    });
  },
};
