import { prisma, type PrismaTransaction } from '../libs/database/prisma'

export const employmentRepository = {
    async getEmploymentsByUserId(userId: number, tx: PrismaTransaction = prisma) {
        return await tx.employment.findMany({
            where: {
                userId: userId
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
                }
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
                posId: posId
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
                }
            }
        })
    },
    async getEmploymentsByUserAndPrivilege(username: string, privCondition: any, tx: PrismaTransaction = prisma) {
        return await tx.employment.findMany({
            where: {
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

}