import type { PrismaTransaction } from "@/db";
import { Status } from "@enums/status";
import { prisma } from "@/db";

export const roleRepository = {
  async getRoleByCode(roleCode: string, tx: PrismaTransaction = prisma) {
    return await tx.role.findFirst({
      where: {
        roleCode,
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getRolesByUserId(userId: number, tx: PrismaTransaction = prisma) {
    return await tx.role.findMany({
      where: {
        status: Status.Enable,
        isDelete: false,
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
                OR: [
                  {
                    isAllSub: false,
                    organization: {
                      deptEmployments: {
                        some: {
                          userId,
                          status: Status.Enable,
                        },
                      },
                    },
                  },
                  {
                    isAllSub: true,
                    organization: {
                      ancestorClosures: {
                        some: {
                          descendant: {
                            deptEmployments: {
                              some: {
                                userId,
                                status: Status.Enable,
                              },
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
    });
  },
  async getRolesByAncestorOrgs(ancestorgIds: number[], tx: PrismaTransaction = prisma) {
    return await tx.role.findMany({
      where: {
        organizations: {
          some: {
            organizationId: {
              in: ancestorgIds,
            },
            isAllSub: true,
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getRolesByDirectOrg(orgId: number, tx: PrismaTransaction = prisma) {
    return await tx.role.findMany({
      where: {
        organizations: {
          some: {
            organizationId: orgId,
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getRolesByPosition(posId: number, tx: PrismaTransaction = prisma) {
    return await tx.role.findMany({
      where: {
        positions: {
          some: {
            positionId: posId,
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getRolesByPosOrg(posOrgId: number, tx: PrismaTransaction = prisma) {
    return await tx.role.findMany({
      where: {
        positionOrganizations: {
          some: {
            posOrgId,
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getRolesByEmployment(employmentId: number, tx: PrismaTransaction = prisma) {
    return await tx.role.findMany({
      where: {
        employments: {
          some: {
            employmentId,
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getRolesByEmploymentId(employmentId: number, tx: PrismaTransaction = prisma) {
    return await tx.role.findMany({
      where: {
        status: Status.Enable,
        isDelete: false,
        OR: [
          {
            positions: {
              some: {
                position: {
                  employments: {
                    some: {
                      id: employmentId,
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
                OR: [
                  {
                    isAllSub: false,
                    organization: {
                      deptEmployments: {
                        some: {
                          id: employmentId,
                          status: Status.Enable,
                        },
                      },
                    },
                  },
                  {
                    isAllSub: true,
                    organization: {
                      ancestorClosures: {
                        some: {
                          descendant: {
                            deptEmployments: {
                              some: {
                                id: employmentId,
                                status: Status.Enable,
                              },
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
          {
            positionOrganizations: {
              some: {
                posOrg: {
                  employments: {
                    some: {
                      id: employmentId,
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
                  id: employmentId,
                  status: Status.Enable,
                },
              },
            },
          },
        ],
      },
    });
  },
  async checkEmploymentRoleExisting(roleId: number, employmentId: number, tx: PrismaTransaction = prisma) {
    return (await tx.employmentRole.findFirst({
      where: {
        roleId,
        employmentId,
      },
    })) !== null;
  },
  async setRole(roleCode: string, roleName: string, tx: PrismaTransaction = prisma) {
    return await tx.role.create({
      data: {
        roleCode,
        roleName,
        clientId: 1,
      },
    });
  },
  async setRolePrivilege(roleId: number, privilegeId: number, tx: PrismaTransaction = prisma) {
    return await tx.rolePrivilege.create({
      data: {
        roleId,
        privilegeId,
      },
    });
  },
  async setRoleForEmployment(roleId: number, employmentId: number, tx: PrismaTransaction = prisma) {
    return await tx.employmentRole.create({
      data: {
        roleId,
        employmentId,
      },
    });
  },
  async setRoleForOrganization(roleId: number, orgId: number, tx: PrismaTransaction = prisma) {
    return await tx.organizationRole.create({
      data: {
        roleId,
        organizationId: orgId,
      },
    });
  },
  async setRoleForPosition(roleId: number, posId: number, tx: PrismaTransaction = prisma) {
    return await tx.positionRole.create({
      data: {
        roleId,
        positionId: posId,
      },
    });
  },
  async setRoleForPosOrg(roleId: number, posOrgId: number, tx: PrismaTransaction = prisma) {
    return await tx.posOrgRole.create({
      data: {
        roleId,
        posOrgId,
      },
    });
  },
  async deleteRoleForPosOrg(roleId: number, posOrgId: number, tx: PrismaTransaction = prisma) {
    return await tx.posOrgRole.delete({
      where: {
        posOrgId_roleId: {
          roleId,
          posOrgId,
        },
      },
    });
  },
  async deleteRoleForEmployment(roleId: number, employmentId: number, tx: PrismaTransaction = prisma) {
    return await tx.employmentRole.delete({
      where: {
        employmentId_roleId: {
          roleId,
          employmentId,
        },
      },
    });
  },
};
