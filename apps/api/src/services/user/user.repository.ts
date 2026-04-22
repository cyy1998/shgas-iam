import type { PrismaTransaction } from "@/db";
import type { UserAdminCreateDto, UserCreateDto, UserPaginationQueryDto, UserQueryDto } from "@/services/user/user.type";
import type { Prettify } from "@/utils/lint.util";
import { Status } from "@enums/status";
import { prisma } from "@/db";

export async function getUserById(userId: number, tx: PrismaTransaction = prisma) {
  return await tx.user.findFirst({
    where: {
      id: userId,
      status: Status.Enable,
      isDelete: false,
    },
  });
}
export async function getUserByUsername(username: string, tx: PrismaTransaction = prisma) {
  return await tx.user.findFirst({
    where: {
      username,
      status: Status.Enable,
      isDelete: false,
    },
  });
}
export async function getUserByWxId(wxId: string, tx: PrismaTransaction = prisma) {
  return await tx.user.findFirst({
    where: {
      wxId,
      status: Status.Enable,
      isDelete: false,
    },
  });
}
export async function getUserByMobile(mobile: string, tx: PrismaTransaction = prisma) {
  return await tx.user.findFirst({
    where: {
      mobile,
      status: Status.Enable,
      isDelete: false,
    },
  });
}
export async function searchUsers(
  query: UserQueryDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.findMany({
    where: {
      username: {
        in: query.usernames,
      },
      mobile: {
        in: query.phones,
      },
      wxId: {
        in: query.wxIds,
      },
      employments: {
        some: {
          status: Status.Enable,
          isDelete: false,
          deptartment: {
            descendantClosures: {
              some: {
                ancestor: {
                  orgCode: {
                    in: query.ancestorOrgCodes,
                  },
                },
                depth: {
                  in: query.ancestorOrgDepths,
                },
              },
            },
          },
          position: {
            status: Status.Enable,
            isDelete: false,
            posCode: {
              in: query.positionCodes,
            },
          },
          OR: [
            {
              position: {
                roles: {
                  some: {
                    role: {
                      status: Status.Enable,
                      isDelete: false,
                      roleCode: {
                        in: query.roleCodes,
                      },
                    },
                  },
                },
              },
            },
            {
              roles: {
                some: {
                  role: {
                    status: Status.Enable,
                    isDelete: false,
                    roleCode: {
                      in: query.roleCodes,
                    },
                  },
                },
              },
            },
            {
              deptartment: {
                descendantClosures: {
                  some: {
                    OR: [
                      {
                        depth: 0,
                        ancestor: {
                          roles: {
                            some: {
                              role: {
                                status: Status.Enable,
                                isDelete: false,
                                roleCode: {
                                  in: query.roleCodes,
                                },
                              },
                            },
                          },
                        },
                      },
                      {
                        depth: {
                          gt: 0,
                        },
                        ancestor: {
                          roles: {
                            some: {
                              isAllSub: true,
                              role: {
                                status: Status.Enable,
                                isDelete: false,
                                roleCode: {
                                  in: query.roleCodes,
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
      status: Status.Enable,
      isDelete: false,
    },
  });
}
export async function searchUsersFuzzy(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.findMany({
    where: {
      OR: userPaginationQueryDto.conditions.fuzzyConditions.text !== undefined
        ? [
            {
              username: {
                contains: userPaginationQueryDto.conditions.fuzzyConditions.text,
              },
            },
            {
              name: {
                contains: userPaginationQueryDto.conditions.fuzzyConditions.text,
              },
            },
            {
              mobile: {
                contains: userPaginationQueryDto.conditions.fuzzyConditions.text,
              },
            },
            {
              wxId: {
                contains: userPaginationQueryDto.conditions.fuzzyConditions.text,
              },
            },
          ]
        : undefined,
      userType: {
        in: userPaginationQueryDto.conditions.exactConditions.userTypes,
      },
      username: {
        in: userPaginationQueryDto.conditions.exactConditions.usernames,
      },
      mobile: {
        in: userPaginationQueryDto.conditions.exactConditions.phones,
      },
      wxId: {
        in: userPaginationQueryDto.conditions.exactConditions.wxIds,
      },
      status: {
        in: userPaginationQueryDto.conditions.exactConditions.statuses,
      },
      isDelete: false,
    },
  });
}
export async function setPassword(userId: number, password: string, tx: PrismaTransaction = prisma) {
  return await tx.user.update({
    where: {
      id: userId,
      status: Status.Enable,
      isDelete: false,
    },
    data: {
      password,
    },
  });
}
export async function setMobile(userId: number, phoneNumber: string, tx: PrismaTransaction = prisma) {
  return await tx.user.update({
    where: {
      id: userId,
      status: Status.Enable,
      isDelete: false,
    },
    data: {
      mobile: phoneNumber,
    },
  });
}
export async function setUser(userCreateDto: UserCreateDto, tx: PrismaTransaction = prisma) {
  return await tx.user.create({
    data: userCreateDto,
  });
}

export async function setUsers(
  userCreateDtos: Prettify<UserCreateDto>[],
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.createMany({
    data: userCreateDtos,
  });
}

export async function getOtherUsersByOrgAndAllSub(userId: number, orgCode: string, tx: PrismaTransaction = prisma) {
  return await tx.user.findMany({
    where: {
      employments: {
        some: {
          deptartment: {
            descendantClosures: {
              some: {
                ancestor: {
                  orgCode,
                },
              },
            },
          },
        },
      },
      NOT: {
        id: userId,
      },
      status: Status.Enable,
      isDelete: false,
    },
  });
}

export async function getUserByUsernameForAdmin(
  username: string,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.findFirst({
    where: {
      username,
      isDelete: false,
    },
  });
}

export async function countUsersFuzzy(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.count({
    where: {
      OR: userPaginationQueryDto.conditions.fuzzyConditions.text !== undefined
        ? [
            { username: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
            { name: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
            { mobile: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
            { wxId: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
          ]
        : undefined,
      userType: { in: userPaginationQueryDto.conditions.exactConditions.userTypes },
      username: { in: userPaginationQueryDto.conditions.exactConditions.usernames },
      mobile: { in: userPaginationQueryDto.conditions.exactConditions.phones },
      wxId: { in: userPaginationQueryDto.conditions.exactConditions.wxIds },
      status: { in: userPaginationQueryDto.conditions.exactConditions.statuses },
      isDelete: false,
    },
  });
}

export async function searchUsersFuzzyPaged(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  const { pageNum, pageSize } = userPaginationQueryDto;
  const where = {
    OR: userPaginationQueryDto.conditions.fuzzyConditions.text !== undefined
      ? [
          { username: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
          { name: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
          { mobile: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
          { wxId: { contains: userPaginationQueryDto.conditions.fuzzyConditions.text } },
        ]
      : undefined,
    userType: { in: userPaginationQueryDto.conditions.exactConditions.userTypes },
    username: { in: userPaginationQueryDto.conditions.exactConditions.usernames },
    mobile: { in: userPaginationQueryDto.conditions.exactConditions.phones },
    wxId: { in: userPaginationQueryDto.conditions.exactConditions.wxIds },
    status: { in: userPaginationQueryDto.conditions.exactConditions.statuses },
    isDelete: false,
  };
  const [rows, total] = await Promise.all([
    tx.user.findMany({
      where,
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy: [{ orderNum: "asc" }, { id: "asc" }],
    }),
    tx.user.count({ where }),
  ]);
  return { rows, total };
}

export async function updateUserByUsername(
  username: string,
  data: {
    name?: string;
    mobile?: string | null;
    wxId?: string | null;
    userType?: string;
    status?: number;
    orderNum?: number;
  },
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.update({
    where: { username },
    data,
  });
}

export async function softDeleteUserByUsername(
  username: string,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.update({
    where: { username },
    data: { isDelete: true },
  });
}

export async function countActiveEmploymentsByUsername(
  username: string,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.count({
    where: {
      isDelete: false,
      status: Status.Enable,
      user: {
        username,
        isDelete: false,
      },
    },
  });
}

export async function setUserForAdmin(
  userCreateDto: UserAdminCreateDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.create({
    data: userCreateDto,
  });
}
