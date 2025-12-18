import { EmploymentStatus, type EmploymentDTO } from "../types/employment.type"
import { prisma } from "../extensions"
import { organizationRepository } from "./organization.repository"

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
    }
}