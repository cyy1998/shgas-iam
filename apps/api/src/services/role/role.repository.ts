import type { PrismaTransaction } from "@api/db";
import { prisma } from "@api/db";
import { Status } from "@api/enums/status";

export async function getRoleByCode(roleCode: string, tx: PrismaTransaction = prisma) {
  return await tx.role.findFirst({
    where: {
      roleCode,
      status: Status.Enable,
      isDelete: false,
    },
  });
}
export async function getRolesByUserId(userId: number, tx: PrismaTransaction = prisma) {
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
}
export async function getRolesByAncestorOrgs(ancestorgIds: number[], tx: PrismaTransaction = prisma) {
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
}
export async function getRolesByDirectOrg(orgId: number, tx: PrismaTransaction = prisma) {
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
}
export async function getRolesByPosition(posId: number, tx: PrismaTransaction = prisma) {
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
}
export async function getRolesByPosOrg(posOrgId: number, tx: PrismaTransaction = prisma) {
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
}
export async function getRolesByEmployment(employmentId: number, tx: PrismaTransaction = prisma) {
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
}
export async function getRolesByEmploymentId(employmentId: number, tx: PrismaTransaction = prisma) {
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
}
export async function checkEmploymentRoleExisting(
  roleId: number,
  employmentId: number,
  tx: PrismaTransaction = prisma,
) {
  return (await tx.employmentRole.findFirst({
    where: {
      roleId,
      employmentId,
    },
  })) !== null;
}
export async function setRole(roleCode: string, roleName: string, tx: PrismaTransaction = prisma) {
  return await tx.role.create({
    data: {
      roleCode,
      roleName,
      clientId: 1,
    },
  });
}
export async function setRolePrivilege(roleId: number, privilegeId: number, tx: PrismaTransaction = prisma) {
  return await tx.rolePrivilege.create({
    data: {
      roleId,
      privilegeId,
    },
  });
}
export async function setRoleForEmployment(roleId: number, employmentId: number, tx: PrismaTransaction = prisma) {
  return await tx.employmentRole.create({
    data: {
      roleId,
      employmentId,
    },
  });
}
export async function setRoleForOrganization(roleId: number, orgId: number, tx: PrismaTransaction = prisma) {
  return await tx.organizationRole.create({
    data: {
      roleId,
      organizationId: orgId,
    },
  });
}
export async function setRoleForPosition(roleId: number, posId: number, tx: PrismaTransaction = prisma) {
  return await tx.positionRole.create({
    data: {
      roleId,
      positionId: posId,
    },
  });
}
export async function setRoleForPosOrg(roleId: number, posOrgId: number, tx: PrismaTransaction = prisma) {
  return await tx.posOrgRole.create({
    data: {
      roleId,
      posOrgId,
    },
  });
}
export async function deleteRoleForPosOrg(roleId: number, posOrgId: number, tx: PrismaTransaction = prisma) {
  return await tx.posOrgRole.delete({
    where: {
      posOrgId_roleId: {
        roleId,
        posOrgId,
      },
    },
  });
}
export async function deleteRoleForEmployment(roleId: number, employmentId: number, tx: PrismaTransaction = prisma) {
  return await tx.employmentRole.delete({
    where: {
      employmentId_roleId: {
        roleId,
        employmentId,
      },
    },
  });
}
