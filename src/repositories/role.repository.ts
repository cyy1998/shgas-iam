import { EmploymentStatus } from "../constants/employment.status"
import { prisma } from '../libs/database/prisma'

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
    async getRolesByEmploymentId(employmentId: number) {
        return await prisma.role.findMany({
            where: {
                OR: [
                    {
                        positions: {
                            some: {
                                position: {
                                    employments: {
                                        some: {
                                            id: employmentId,
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
                                                    id: employmentId,
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
                                                                id: employmentId,
                                                                status: EmploymentStatus.Enable
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ]

                            }
                        }
                    },
                    {
                        positionOrganizations: {
                            some: {
                                posOrg: {
                                    employments: {
                                        some: {
                                            id: employmentId,
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
                                    id: employmentId,
                                    status: EmploymentStatus.Enable
                                }
                            }
                        }
                    }
                ]
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
    async setRole(roleCode: string, roleName: string) {
        return await prisma.role.create({
            data: {
                roleCode: roleCode,
                roleName: roleName,
                clientId: 1
            }
        })
    },
    async setRolePrivilege(roleId: number, privilegeId: number) {
        return await prisma.rolePrivilege.create({
            data: {
                roleId: roleId,
                privilegeId: privilegeId
            }
        })
    },
    async setRoleForEmployment(roleId: number, employmentId: number) {
        return await prisma.employmentRole.create({
            data: {
                roleId: roleId,
                employmentId: employmentId
            }
        })
    },
    async setRoleForOrganization(roleId: number, orgId: number) {
        return await prisma.organizationRole.create({
            data: {
                roleId: roleId,
                organizationId: orgId
            }
        })
    },
    async setRoleForPosOrg(roleId: number, posOrgId: number) {
        return await prisma.posOrgRole.create({
            data: {
                roleId: roleId,
                posOrgId: posOrgId
            }
        })
    },
    async deleteRoleForPosOrg(roleId: number, posOrgId: number) {
        return await prisma.posOrgRole.delete({
            where: {
                posOrgId_roleId: {
                    roleId: roleId,
                    posOrgId: posOrgId
                }
            }
        })
    },
    async deleteRoleForEmployment(roleId: number, employmentId: number) {
        return await prisma.employmentRole.delete({
            where: {
                employmentId_roleId: {
                    roleId: roleId,
                    employmentId: employmentId
                }
            }
        })
    },
}