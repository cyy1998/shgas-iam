import { prisma } from "../extensions"

export const employmentRepository = {
    async getEmploymentsByUserId(userId: number) {
        return await prisma.employment.findMany({
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
    async getEmploymentsByUserOrgPos(userId: number, orgId: number, posId: number) {
        return await prisma.employment.findFirst({
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
    async getEmploymentsByUserAndPrivilege(username: string, privCondition: any) {
        return await prisma.employment.findMany({
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
    async setEmployment(userId: number, posId: number, deptId: number, compId: number) {
        return await prisma.employment.create({
            data: {
                userId: userId,
                posId: posId,
                deptId: deptId,
                compId: compId
            }
        })
    }
}