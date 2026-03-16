import type { UserQueryDto } from "@schemas/user.common.type";
import type { PrismaTransaction } from "@/db";
import { Status } from "@enums/status";
import { prisma } from "@/db";

export const userRepository = {
  async getUserById(userId: number, tx: PrismaTransaction = prisma) {
    return await tx.user.findFirst({
      where: {
        id: userId,
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getUserByUsername(username: string, tx: PrismaTransaction = prisma) {
    return await tx.user.findFirst({
      where: {
        username,
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getUserByWxId(wxId: string, tx: PrismaTransaction = prisma) {
    return await tx.user.findFirst({
      where: {
        wxId,
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getUserByMobile(mobile: string, tx: PrismaTransaction = prisma) {
    return await tx.user.findFirst({
      where: {
        mobile,
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async searchUsers(
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
              // {
              //     posOrg: {
              //         roles: {
              //             some: {
              //                 role: {
              //                     status: Status.Enable,
              //                     isDelete: false,
              //                     roleCode: {
              //                         in: userQueryDto.roleCodes
              //                     }
              //                 }
              //             }
              //         }
              //     }
              // },
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
  },
  async setPassword(userId: number, password: string, tx: PrismaTransaction = prisma) {
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
  },
  async setMobile(userId: number, phoneNumber: string, tx: PrismaTransaction = prisma) {
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
  },
  async setUser(username: string, name: string, mobile: string, userType: string, tx: PrismaTransaction = prisma) {
    return await tx.user.create({
      data: {
        username,
        name,
        mobile,
        userType,
      },
    });
  },

  async getUsersByOrg(orgCode: string, tx: PrismaTransaction = prisma) {
    return await tx.user.findMany({
      where: {
        employments: {
          some: {
            deptartment: {
              orgCode,
            },
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getUsersByOrgAndAllSub(orgCode: string, tx: PrismaTransaction = prisma) {
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
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getOtherUsersByOrgAndAllSub(userId: number, orgCode: string, tx: PrismaTransaction = prisma) {
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
  },
  async getUsersByOrgRole(orgCode: string, roleCode: string, tx: PrismaTransaction = prisma) {
    return await tx.user.findMany({
      where: {
        employments: {
          some: {
            AND: [
              {
                deptartment: {
                  orgCode,
                },
                status: Status.Enable,
              },
              {
                OR: [
                  {
                    position: {
                      roles: {
                        some: {
                          role: {
                            roleCode,
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
                            roleCode,
                          },
                        },
                      },
                    },
                  },
                  {
                    roles: {
                      some: {
                        role: {
                          roleCode,
                        },
                      },
                    },
                  },
                  {
                    deptartment: {
                      roles: {
                        some: {
                          role: {
                            roleCode,
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
                            roleCode,
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getUsersByOrgAndAllSubRole(orgCode: string, roleCode: string, tx: PrismaTransaction = prisma) {
    return await tx.user.findMany({
      where: {
        // userType: '正式员工',
        employments: {
          some: {
            AND: [
              {
                deptartment: {
                  descendantClosures: {
                    some: {
                      ancestor: {
                        orgCode,
                      },
                    },
                  },
                },
                status: Status.Enable,
              },
              {
                OR: [
                  {
                    position: {
                      roles: {
                        some: {
                          role: {
                            roleCode,
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
                            roleCode,
                          },
                        },
                      },
                    },
                  },
                  {
                    roles: {
                      some: {
                        role: {
                          roleCode,
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
                                      roleCode,
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
                                      roleCode,
                                    },
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                      // roles: {
                      //     some: {
                      //         role: {
                      //             roleCode: roleCode
                      //         }
                      //     }
                      // }
                    },
                  },
                ],
              },
            ],
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getUsersByOrgPos(orgCode: string, posCode: string, tx: PrismaTransaction = prisma) {
    return await tx.user.findMany({
      where: {
        employments: {
          some: {
            deptartment: {
              orgCode,
            },
            position: {
              posCode,
            },
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },
  async getUsersByOrgAndAllSubPos(orgCode: string, posCode: string, tx: PrismaTransaction = prisma) {
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
            position: {
              posCode,
            },
          },
        },
        status: Status.Enable,
        isDelete: false,
      },
    });
  },

};
