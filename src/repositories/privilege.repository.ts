import { EmploymentStatus } from "../types/employment.type"
import { prisma } from "../extensions"

export const privilegeRepository = {
    async getPrivilegesByUserId(userId: number) {
        return await prisma.privilege.findMany({
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
                                                        userId: userId,
                                                        status: EmploymentStatus.Enable
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                {
                                    organizations: {
                                        some: {
                                            organization: {
                                                OR: [
                                                    {
                                                        deptEmployments: {
                                                            some: {
                                                                userId: userId,
                                                                status: EmploymentStatus.Enable
                                                            }
                                                        }
                                                    },
                                                    {
                                                        compEmployments: {
                                                            some: {
                                                                userId: userId,
                                                                status: EmploymentStatus.Enable
                                                            }
                                                        }
                                                    },
                                                ]
                                            }

                                        }
                                    }
                                },
                                {
                                    positionOrganizations: {
                                        some: {
                                            posOrg: {
                                                employments: {
                                                    some: {
                                                        userId: userId,
                                                        status: EmploymentStatus.Enable
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                {
                                    employments: {
                                        some: {
                                            employment: {
                                                userId: userId,
                                                status: EmploymentStatus.Enable
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            },
            include: {
                object: true
            }
        })
    },
    async getPrivilegesByRoles(roleIds: number[]) {
        return await prisma.privilege.findMany({
            where: {
                roles: {
                    some: {
                        roleId: {
                            in: roleIds
                        }
                    }
                }
            },
            include: {
                object: true
            }
        })
    },
    async getPrivilegeByCode(privCode: string) {
        return await prisma.privilege.findFirst({
            where: {
                privilegeCode: privCode
            }
        })
    },
    async setPrivilege(privCode: string, privName: string) {
        return await prisma.privilege.create({
            data: {
                privilegeCode: privCode,
                privilegeName: privName,
                objectId: 1
            }
        })
    }
} 