import type { EmploymentQueryDto } from "@/services/employment/employment.schema";
import type { PrismaTransaction } from "@/db";
import { Status } from "@enums/status";
import { prisma } from "@/db";

export const employmentRepository = {
  async getEmploymentsByUserId(userId: number, tx: PrismaTransaction = prisma) {
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
  },
  async getEmploymentsByUsername(username: string, tx: PrismaTransaction = prisma) {
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
  },
  async getEmploymentByUserOrgPosId(userId: number, orgId: number, posId: number, tx: PrismaTransaction = prisma) {
    return await tx.employment.findFirst({
      where: {
        userId,
        deptId: orgId,
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
  },
  async getEmploymentByUserOrgPosCode(username: string, orgCode: string, posCode: string, tx: PrismaTransaction = prisma) {
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
  },
  async getEmploymentsByUserAndPrivilege(username: string, privCondition: any, tx: PrismaTransaction = prisma) {
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
  },
  async setEmployment(userId: number, posId: number, deptId: number, compId: number, tx: PrismaTransaction = prisma) {
    return await tx.employment.create({
      data: {
        userId,
        posId,
        deptId,
        compId,
      },
    });
  },
  async searchEmployments(
    employmentQueryDto: EmploymentQueryDto,
    tx: PrismaTransaction = prisma,
  ) {
    return await tx.employment.findMany({
      where: {
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
      },
      include: {
        user: true,
        deptartment: true,
        company: true,
        position: true,
      },
    });
  },
};
