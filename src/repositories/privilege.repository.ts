import { EmploymentStatus } from "../constants/employment.status"
import { prisma, type PrismaTransaction } from '../libs/database/prisma'

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
            }
        })
    },
    async getPrivilegesByRoles(roleIds: number[], tx: PrismaTransaction = prisma) {
        return await tx.privilege.findMany({
            where: {
                roles: {
                    some: {
                        roleId: {
                            in: roleIds
                        }
                    }
                }
            }
        })
    },
    async getPrivilegeByCode(privCode: string, tx: PrismaTransaction = prisma) {
        return await tx.privilege.findFirst({
            where: {
                privilegeCode: privCode
            }
        })
    },
    async setPrivilege(privCode: string, privName: string, tx: PrismaTransaction = prisma) {
        return await tx.privilege.create({
            data: {
                privilegeCode: privCode,
                privilegeName: privName,
            }
        })
    }
} 