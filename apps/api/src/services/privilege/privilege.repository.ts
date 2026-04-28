import type { PrivilegeQueryDto } from "./privilege.type";
import type { PrismaTransaction } from "@/db";
import type { Prettify } from "@/utils/lint.util";
import { Status } from "@/enums/status";
import { prisma } from "@/db";

export async function getPrivilegesByUserId(userId: number, tx: PrismaTransaction = prisma) {
  return await tx.privilege.findMany({
    where: {
      roles: {
        some: {
          role: {
            OR: [
              {
                positions: {
                  some: {
                    position: {
                      employments: {
                        some: {
                          userId,
                          status: Status.Enable,
                        },
                      },
                    },
                  },
                },
              },
              {
                organizations: {
                  some: {
                    organization: {
                      OR: [
                        {
                          deptEmployments: {
                            some: {
                              userId,
                              status: Status.Enable,
                            },
                          },
                        },
                        {
                          compEmployments: {
                            some: {
                              userId,
                              status: Status.Enable,
                            },
                          },
                        },
                      ],
                    },

                  },
                },
              },
              {
                positionOrganizations: {
                  some: {
                    posOrg: {
                      employments: {
                        some: {
                          userId,
                          status: Status.Enable,
                        },
                      },
                    },
                  },
                },
              },
              {
                employments: {
                  some: {
                    employment: {
                      userId,
                      status: Status.Enable,
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  });
}
export async function getPrivilegesByRoleIds(roleIds: number[], tx: PrismaTransaction = prisma) {
  return await tx.privilege.findMany({
    where: {
      roles: {
        some: {
          roleId: {
            in: roleIds,
          },
        },
      },
    },
  });
}
export async function getPrivilegeByCode(privCode: string, tx: PrismaTransaction = prisma) {
  return await tx.privilege.findFirst({
    where: {
      privilegeCode: privCode,
    },
  });
}
export async function setPrivilege(privCode: string, privName: string, tx: PrismaTransaction = prisma) {
  return await tx.privilege.create({
    data: {
      privilegeCode: privCode,
      privilegeName: privName,
    },
  });
}

export async function searchPrivileges(
  query: Prettify<PrivilegeQueryDto>,
  tx: PrismaTransaction = prisma,
) {
  return await tx.privilege.findMany({
    where: {
      privilegeCode: {
        in: query.privilegeCodes,
      },
      ...(query.roleCodes !== undefined && {
        roles: {
          some: {
            role: {
              roleCode: {
                in: query.roleCodes,
              },
            },
          },
        },
      }),
    },
  });
}
