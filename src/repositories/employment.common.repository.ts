import { EmploymentStatus } from '../constants/employment.status'
import { PositionStatus } from '../constants/position.status'
import { RoleStatus } from '../constants/role.status'
import { UserStatus } from '../constants/user.status'
import { prisma, type PrismaTransaction } from '../libs/database/prisma'
import type { EmploymentQueryDto } from '../types/employment.common.type'

export const employmentRepository = {
    async getEmploymentsByUserId(userId: number, tx: PrismaTransaction = prisma) {
        return await tx.employment.findMany({
            where: {
                userId: userId,
                status: EmploymentStatus.Enable,
                isDelete: false
            },
            include: {
                user: true,
                deptartment: true,
                company: true,
                position: true
            }
        })
    },
    async getEmploymentsByUsername(username: string, tx: PrismaTransaction = prisma) {
        return await tx.employment.findMany({
            where: {
                user: {
                    username: username
                },
                status: EmploymentStatus.Enable,
                isDelete: false
            },
            include: {
                user: true,
                deptartment: true,
                company: true,
                position: true
            }
        })
    },
    async getEmploymentByUserOrgPosId(userId: number, orgId: number, posId: number, tx: PrismaTransaction = prisma) {
        return await tx.employment.findFirst({
            where: {
                userId: userId,
                deptId: orgId,
                posId: posId,
                status: EmploymentStatus.Enable,
                isDelete: false
            },
            include: {
                user: true,
                deptartment: true,
                company: true,
                position: true
            }
        })
    },
    async getEmploymentByUserOrgPosCode(username: string, orgCode: string, posCode: string, tx: PrismaTransaction = prisma) {
        return await tx.employment.findFirst({
            where: {
                user: {
                    username: username,
                },
                deptartment: {
                    orgCode: orgCode
                },
                position: {
                    posCode: posCode
                },
                status: EmploymentStatus.Enable,
                isDelete: false
            }
        })
    },
    async getEmploymentsByUserAndPrivilege(username: string, privCondition: any, tx: PrismaTransaction = prisma) {
        return await tx.employment.findMany({
            where: {
                status: EmploymentStatus.Enable,
                isDelete: false,
                user: {
                    username: username
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
                                                    privilegeCode: privCondition
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        company: {
                            roles: {
                                some: {
                                    role: {
                                        privileges: {
                                            some: {
                                                privilege: {
                                                    privilegeCode: privCondition
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        position: {
                            roles: {
                                some: {
                                    role: {
                                        privileges: {
                                            some: {
                                                privilege: {
                                                    privilegeCode: privCondition
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        posOrg: {
                            roles: {
                                some: {
                                    role: {
                                        privileges: {
                                            some: {
                                                privilege: {
                                                    privilegeCode: privCondition
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        roles: {
                            some: {
                                role: {
                                    privileges: {
                                        some: {
                                            privilege: {
                                                privilegeCode: privCondition
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            include: {
                deptartment: true,
                company: true,
                position: true,
                user: true
            }
        })
    },
    async setEmployment(userId: number, posId: number, deptId: number, compId: number, tx: PrismaTransaction = prisma) {
        return await tx.employment.create({
            data: {
                userId: userId,
                posId: posId,
                deptId: deptId,
                compId: compId
            }
        })
    },
    async searchEmployments(
        employmentQueryDto: EmploymentQueryDto,
        tx: PrismaTransaction = prisma
    ) {
        return await tx.employment.findMany({
            where: {
                user: {
                    username: {
                        in: employmentQueryDto.usernames
                    },
                    mobilePhone: {
                        in: employmentQueryDto.phones
                    },
                    wxId: {
                        in: employmentQueryDto.wxIds
                    },
                    status: UserStatus.Enable,
                    isDelete: false
                },

                deptartment: {
                    descendantClosures: {
                        some: {
                            ancestor: {
                                orgCode: {
                                    in: employmentQueryDto.ancestorOrgCodes
                                }
                            },
                            depth: {
                                in: employmentQueryDto.ancestorOrgDepths
                            }
                        }
                    }
                },
                position: {
                    status: PositionStatus.Enable,
                    isDelete: false,
                    posCode: {
                        in: employmentQueryDto.positionCodes
                    }
                },
                OR: [
                    {
                        position: {
                            roles: {
                                some: {
                                    role: {
                                        status: RoleStatus.Enable,
                                        isDelete: false,
                                        roleCode: {
                                            in: employmentQueryDto.roleCodes
                                        }
                                    }
                                }
                            }
                        },
                    },
                    {
                        roles: {
                            some: {
                                role: {
                                    status: RoleStatus.Enable,
                                    isDelete: false,
                                    roleCode: {
                                        in: employmentQueryDto.roleCodes
                                    }
                                }
                            }
                        }
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
                                                            status: RoleStatus.Enable,
                                                            isDelete: false,
                                                            roleCode: {
                                                                in: employmentQueryDto.roleCodes
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        },
                                        {
                                            depth: {
                                                gt: 0
                                            },
                                            ancestor: {
                                                roles: {
                                                    some: {
                                                        isAllSub: true,
                                                        role: {
                                                            status: RoleStatus.Enable,
                                                            isDelete: false,
                                                            roleCode: {
                                                                in: employmentQueryDto.roleCodes
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                ],
                status: EmploymentStatus.Enable,
                isDelete: false,
            },
            include: {
                user: true,
                deptartment: true,
                company: true,
                position: true
            }
        })
    },

}