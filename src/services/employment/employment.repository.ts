import type { EmploymentQueryDto } from "./employment.type";
import type { PrismaTransaction } from "@/db";
import type { EmploymentWhereInput } from "@/db/generated/prisma/models";
import { Status } from "@enums/status";
import { prisma } from "@/db";

function constructSearchEmploymentsCondition(employmentQueryDto: EmploymentQueryDto): EmploymentWhereInput {
  return {
    user: {
      username: {
        in: employmentQueryDto.usernames,
      },
      mobile: {
        in: employmentQueryDto.phones,
      },
      wxId: {
        in: employmentQueryDto.wxIds,
      },
      status: Status.Enable,
      isDelete: false,
    },
    deptartment: {
      descendantClosures: {
        some: {
          ancestor: {
            orgCode: {
              in: employmentQueryDto.ancestorOrgCodes,
            },
          },
          depth: {
            in: employmentQueryDto.ancestorOrgDepths,
          },
        },
      },
    },
    position: {
      status: Status.Enable,
      isDelete: false,
      posCode: {
        in: employmentQueryDto.positionCodes,
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
                  in: employmentQueryDto.roleCodes,
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
                in: employmentQueryDto.roleCodes,
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
                            in: employmentQueryDto.roleCodes,
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
                            in: employmentQueryDto.roleCodes,
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
    status: Status.Enable,
    isDelete: false,
  };
}

export async function getEmploymentsByUserId(userId: number, tx: PrismaTransaction = prisma) {
  return await tx.employment.findMany({
    where: {
      userId,
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      user: true,
      deptartment: true,
      company: true,
      position: true,
    },
  });
}
export async function getEmploymentsByUsername(username: string, tx: PrismaTransaction = prisma) {
  return await tx.employment.findMany({
    where: {
      user: {
        username,
      },
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      user: true,
      deptartment: true,
      company: true,
      position: true,
    },
  });
}
export async function getEmploymentByUserOrgPosId(userId: number, orgId: number, posId: number, tx: PrismaTransaction = prisma) {
  return await tx.employment.findFirst({
    where: {
      userId,
      orgId,
      posId,
      status: Status.Enable,
      isDelete: false,
    },
    include: {
      user: true,
      deptartment: true,
      company: true,
      position: true,
    },
  });
}
export async function getEmploymentByUserOrgPosCode(username: string, orgCode: string, posCode: string, tx: PrismaTransaction = prisma) {
  return await tx.employment.findFirst({
    where: {
      user: {
        username,
      },
      deptartment: {
        orgCode,
      },
      position: {
        posCode,
      },
      status: Status.Enable,
      isDelete: false,
    },
  });
}
export async function getEmploymentsByUserAndPrivilege(username: string, privCondition: any, tx: PrismaTransaction = prisma) {
  return await tx.employment.findMany({
    where: {
      status: Status.Enable,
      isDelete: false,
      user: {
        username,
      },
      OR: [
        {
          deptartment: {
            roles: {
              some: {
                role: {
                  privileges: {
                    some: {
                      privilege: {
                        privilegeCode: privCondition,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        {
          company: {
            roles: {
              some: {
                role: {
                  privileges: {
                    some: {
                      privilege: {
                        privilegeCode: privCondition,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        {
          position: {
            roles: {
              some: {
                role: {
                  privileges: {
                    some: {
                      privilege: {
                        privilegeCode: privCondition,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        {
          posOrg: {
            roles: {
              some: {
                role: {
                  privileges: {
                    some: {
                      privilege: {
                        privilegeCode: privCondition,
                      },
                    },
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
                privileges: {
                  some: {
                    privilege: {
                      privilegeCode: privCondition,
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
    include: {
      deptartment: true,
      company: true,
      position: true,
      user: true,
    },
  });
}
export async function setEmployment(userId: number, posId: number, orgId: number, compId: number, tx: PrismaTransaction = prisma) {
  return await tx.employment.create({
    data: {
      userId,
      posId,
      orgId,
      compId,
    },
  });
}

export async function searchEmployments(
  employmentQueryDto: EmploymentQueryDto,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.findMany({
    where: constructSearchEmploymentsCondition(employmentQueryDto),
    include: {
      user: true,
      deptartment: true,
      company: true,
      position: true,
    },
  });
}
