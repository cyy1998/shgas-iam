import { EmploymentStatus } from "../constants/employment.status"
import { RoleStatus } from "../constants/role.status"
import { prisma, type PrismaTransaction } from '../libs/database/prisma'

export const roleRepository = {
    async getRoleByCode(roleCode: string, tx: PrismaTransaction = prisma) {
        return await tx.role.findFirst({
            where: {
                roleCode: roleCode,
                status: RoleStatus.Enable,
                isDelete: false
            }
        })
    },
    async getRolesByUserId(userId: number, tx: PrismaTransaction = prisma) {
        return await tx.role.findMany({
            where: {
                status: RoleStatus.Enable,
                isDelete: false,
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
    async getRolesByAncestorOrgs(ancestorgIds: number[], tx: PrismaTransaction = prisma) {
        return await tx.role.findMany({
            where: {
                organizations: {
                    some: {
                        organizationId: {
                            in: ancestorgIds
                        },
                        isAllSub: true
                    }
                },
                status: RoleStatus.Enable,
                isDelete: false
            }
        })
    },
    async getRolesByDirectOrg(orgId: number, tx: PrismaTransaction = prisma) {
        return await tx.role.findMany({
            where: {
                organizations: {
                    some: {
                        organizationId: orgId,
                    }
                },
                status: RoleStatus.Enable,
                isDelete: false
            }
        })
    },
    async getRolesByPosition(posId: number, tx: PrismaTransaction = prisma) {
        return await tx.role.findMany({
            where: {
                positions: {
                    some: {
                        positionId: posId,
                    }
                },
                status: RoleStatus.Enable,
                isDelete: false
            }
        })
    },
    async getRolesByPosOrg(posOrgId: number, tx: PrismaTransaction = prisma) {
        return await tx.role.findMany({
            where: {
                positionOrganizations: {
                    some: {
                        posOrgId: posOrgId,
                    }
                },
                status: RoleStatus.Enable,
                isDelete: false
            }
        })
    },
    async getRolesByEmployment(employmentId: number, tx: PrismaTransaction = prisma) {
        return await tx.role.findMany({
            where: {
                employments: {
                    some: {
                        employmentId: employmentId,
                    }
                },
                status: RoleStatus.Enable,
                isDelete: false
            }
        })
    },
    async getRolesByEmploymentId(employmentId: number, tx: PrismaTransaction = prisma) {
        return await tx.role.findMany({
            where: {
                status: RoleStatus.Enable,
                isDelete: false,
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
    async checkEmploymentRoleExisting(roleId: number, employmentId: number, tx: PrismaTransaction = prisma) {
        return (await tx.employmentRole.findFirst({
            where: {
                roleId: roleId,
                employmentId: employmentId
            }
        })) !== null
    },
    async setRole(roleCode: string, roleName: string, tx: PrismaTransaction = prisma) {
        return await tx.role.create({
            data: {
                roleCode: roleCode,
                roleName: roleName,
                clientId: 1
            }
        })
    },
    async setRolePrivilege(roleId: number, privilegeId: number, tx: PrismaTransaction = prisma) {
        return await tx.rolePrivilege.create({
            data: {
                roleId: roleId,
                privilegeId: privilegeId
            }
        })
    },
    async setRoleForEmployment(roleId: number, employmentId: number, tx: PrismaTransaction = prisma) {
        return await tx.employmentRole.create({
            data: {
                roleId: roleId,
                employmentId: employmentId
            }
        })
    },
    async setRoleForOrganization(roleId: number, orgId: number, tx: PrismaTransaction = prisma) {
        return await tx.organizationRole.create({
            data: {
                roleId: roleId,
                organizationId: orgId
            }
        })
    },
    async setRoleForPosOrg(roleId: number, posOrgId: number, tx: PrismaTransaction = prisma) {
        return await tx.posOrgRole.create({
            data: {
                roleId: roleId,
                posOrgId: posOrgId
            }
        })
    },
    async deleteRoleForPosOrg(roleId: number, posOrgId: number, tx: PrismaTransaction = prisma) {
        return await tx.posOrgRole.delete({
            where: {
                posOrgId_roleId: {
                    roleId: roleId,
                    posOrgId: posOrgId
                }
            }
        })
    },
    async deleteRoleForEmployment(roleId: number, employmentId: number, tx: PrismaTransaction = prisma) {
        return await tx.employmentRole.delete({
            where: {
                employmentId_roleId: {
                    roleId: roleId,
                    employmentId: employmentId
                }
            }
        })
    },
}