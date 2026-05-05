import type { PrismaTransaction } from "@api/db";
import type { EmploymentWhereInput } from "@api/db/generated/prisma/models";
import type { EmploymentAdminPaginationQueryDto, EmploymentQueryDto } from "./employment.type";
import { prisma } from "@api/db";
import { Prisma } from "@api/db/generated/prisma/client";
import { Status } from "@api/enums/status";

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
export async function getEmploymentByUserOrgPosId(
  userId: number,
  orgId: number,
  posId: number,
  tx: PrismaTransaction = prisma,
) {
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
export async function getEmploymentByUserOrgPosCode(
  username: string,
  orgCode: string,
  posCode: string,
  tx: PrismaTransaction = prisma,
) {
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
export async function getEmploymentsByUserAndPrivilege(
  username: string,
  privCondition: any,
  tx: PrismaTransaction = prisma,
) {
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
export async function setEmployment(
  userId: number,
  posId: number,
  orgId: number,
  compId: number,
  tx: PrismaTransaction = prisma,
) {
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

export async function getEmploymentByIdForAdmin(
  id: number,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.findFirst({
    where: {
      id,
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

export async function getEmploymentsByUserIdForAdmin(
  userId: number,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.findMany({
    where: {
      userId,
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

function buildEmploymentAdminWhere(dto: EmploymentAdminPaginationQueryDto) {
  const text = dto.conditions.fuzzyConditions.text;
  return {
    isDelete: false,
    status: { in: dto.conditions.exactConditions.statuses },
    isPrimary: dto.conditions.exactConditions.isPrimary,
    user: {
      isDelete: false,
      username: { in: dto.conditions.exactConditions.usernames },
      ...(text !== undefined
        ? {
            OR: [
              { username: { contains: text, mode: Prisma.QueryMode.insensitive } },
              { name: { contains: text, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    },
    company: {
      isDelete: false,
      orgCode: { in: dto.conditions.exactConditions.companyOrgCodes },
    },
    deptartment: {
      isDelete: false,
      orgCode: { in: dto.conditions.exactConditions.deptOrgCodes },
    },
    position: {
      isDelete: false,
      posCode: { in: dto.conditions.exactConditions.posCodes },
    },
  };
}

export async function searchEmploymentsFuzzyForAdminPaged(
  dto: EmploymentAdminPaginationQueryDto,
  tx: PrismaTransaction = prisma,
) {
  const { pageNum, pageSize } = dto;
  const where = buildEmploymentAdminWhere(dto);
  const [rows, total] = await Promise.all([
    tx.employment.findMany({
      where,
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
      orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
      include: {
        user: true,
        deptartment: true,
        company: true,
        position: true,
      },
    }),
    tx.employment.count({ where }),
  ]);
  return { rows, total };
}

export async function createEmploymentRecord(
  data: {
    userId: number;
    posId: number;
    orgId: number;
    compId: number;
    isPrimary?: boolean;
    startTime?: Date;
    description?: string | null;
    status?: number;
  },
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.create({
    data: {
      userId: data.userId,
      posId: data.posId,
      orgId: data.orgId,
      compId: data.compId,
      isPrimary: data.isPrimary ?? false,
      startTime: data.startTime ?? new Date(),
      description: data.description ?? null,
      status: data.status ?? Status.Enable,
    },
  });
}

export async function updateEmploymentRecord(
  id: number,
  data: {
    isPrimary?: boolean;
    startTime?: Date;
    endTime?: Date | null;
    description?: string | null;
    status?: number;
  },
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.update({
    where: { id },
    data,
  });
}

export async function unsetPrimariesByUserId(
  userId: number,
  exceptEmploymentId: number | null,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.updateMany({
    where: {
      userId,
      isPrimary: true,
      isDelete: false,
      ...(exceptEmploymentId !== null ? { NOT: { id: exceptEmploymentId } } : {}),
    },
    data: { isPrimary: false },
  });
}

export async function softDeleteEmployment(
  id: number,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.update({
    where: { id },
    data: { isDelete: true },
  });
}

export async function endActiveEmploymentsByUserId(
  userId: number,
  tx: PrismaTransaction = prisma,
) {
  return await tx.employment.updateMany({
    where: {
      userId,
      isDelete: false,
      status: { in: [Status.Enable, Status.Pause] },
    },
    data: {
      status: Status.Disable,
      endTime: new Date(),
    },
  });
}
