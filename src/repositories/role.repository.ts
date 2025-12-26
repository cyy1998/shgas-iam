import { EmploymentStatus } from "../types/employment.type"
import { prisma } from "../extensions"

export const roleRepository = {
    async getRoleByCode(roleCode: string) {
        return await prisma.role.findFirst({
            where: {
                roleCode: roleCode
            }
        })
    },
    async getRolesByUserId(userId: number) {
        return await prisma.role.findMany({
            where: {
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
                                OR: [
                                    {
                                        isAllSub: false,
                                        organization: {
                                            deptEmployments: {
                                                some: {
                                                    userId: userId,
                                                    status: EmploymentStatus.Enable
                                                }
                                            }
                                        }
                                    },
                                    {
                                        isAllSub: true,
                                        organization: {
                                            ancestorClosures: {
                                                some: {
                                                    descendant: {
                                                        deptEmployments: {
                                                            some: {
                                                                userId: userId,
                                                                status: EmploymentStatus.Enable
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ]
                                // organization: {
                                //     OR: [
                                //         {
                                //             deptEmployments: {
                                //                 some: {
                                //                     userId: userId,
                                //                     status: EmploymentStatus.Enable
                                //                 }
                                //             }
                                //         },
                                //         {
                                //             compEmployments: {
                                //                 some: {
                                //                     userId: userId,
                                //                     status: EmploymentStatus.Enable
                                //                 }
                                //             }
                                //         },
                                //     ]
                                // }

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
        })
    },
    async getRolesByAncestorOrgs(ancestorgIds: number[]) {
        return await prisma.role.findMany({
            where: {
                organizations: {
                    some: {
                        organizationId: {
                            in: ancestorgIds
                        },
                        isAllSub: true
                    }
                }
            }
        })
    },
    async getRolesByDirectOrg(orgId: number) {
        return await prisma.role.findMany({
            where: {
                organizations: {
                    some: {
                        organizationId: orgId,
                    }
                }
            }
        })
    },
    async getRolesByPosition(posId: number) {
        return await prisma.role.findMany({
            where: {
                positions: {
                    some: {
                        positionId: posId,
                    }
                }
            }
        })
    },
    async getRolesByPosOrg(posOrgId: number) {
        return await prisma.role.findMany({
            where: {
                positionOrganizations: {
                    some: {
                        posOrgId: posOrgId,
                    }
                }
            }
        })
    },
    async getRolesByEmployment(employmentId: number) {
        return await prisma.role.findMany({
            where: {
                employments: {
                    some: {
                        employmentId: employmentId,
                    }
                }
            }
        })
    },
    async checkEmploymentRoleExisting(roleId: number, employmentId: number) {
        return (await prisma.employmentRole.findFirst({
            where: {
                roleId: roleId,
                employmentId: employmentId
            }
        })) !== null
    },
    async setRoleForEmployment(roleId: number, employmentId: number) {
        return await prisma.employmentRole.create({
            data: {
                roleId: roleId,
                employmentId: employmentId
            }
        })
    }
}