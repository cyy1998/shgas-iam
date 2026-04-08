import type { PrismaTransaction } from "@/db";
import type { UserCreateDto, UserPaginationQueryDto, UserQueryDto } from "@/services/user/user.type";
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
  userQueryDto: UserQueryDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.user.findMany({
    where: {
      username: {
        in: userQueryDto.usernames,
      },
      mobile: {
        in: userQueryDto.phones,
      },
      wxId: {
        in: userQueryDto.wxIds,
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
                    in: userQueryDto.ancestorOrgCodes,
                  },
                },
                depth: {
                  in: userQueryDto.ancestorOrgDepths,
                },
              },
            },
          },
          position: {
            status: Status.Enable,
            isDelete: false,
            posCode: {
              in: userQueryDto.positionCodes,
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
                        in: userQueryDto.roleCodes,
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
                      in: userQueryDto.roleCodes,
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
                                  in: userQueryDto.roleCodes,
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
                                  in: userQueryDto.roleCodes,
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
