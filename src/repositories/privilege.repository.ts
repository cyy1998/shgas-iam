import type { PrismaTransaction } from '@/db';
import { prisma } from '@/db';
import { Status } from '@enums/status';

export const privilegeRepository = {
  async getPrivilegesByUserId(userId: number, tx: PrismaTransaction = prisma) {
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
  },
  async getPrivilegesByRoleIds(roleIds: number[], tx: PrismaTransaction = prisma) {
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
  },
  async getPrivilegeByCode(privCode: string, tx: PrismaTransaction = prisma) {
    return await tx.privilege.findFirst({
      where: {
        privilegeCode: privCode,
      },
    });
  },
  async setPrivilege(privCode: string, privName: string, tx: PrismaTransaction = prisma) {
    return await tx.privilege.create({
      data: {
        privilegeCode: privCode,
        privilegeName: privName,
      },
    });
  },
};
