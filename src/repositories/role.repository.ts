import { EmploymentStatus } from "../types/employment.type"
import { prisma } from "../extensions"

export const roleRepository = {
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
        })
    },
    // async getRolesByOrganization(orgId: number) {
    //     return await prisma.role.findMany({
    //         where: {
    //             organizations: {
    //                 some: {
    //                     is
    //                 }
    //             }
    //         }
    //     })
    // }
}