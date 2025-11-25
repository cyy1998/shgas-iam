import { EmploymentStatus } from "../constant"
import { prisma } from "../extensions"

export const userRepository = {
    async getUserByUsername(username: string) {
        return await prisma.user.findFirst({
            where: {
                username: username
            }
        })
    },
    async getUserByMobile(mobile: string) {
        return await prisma.user.findFirst({
            where: {
                mobilePhone: mobile
            }
        })
    },
    async setPassword(userId: number, password: string) {
        return await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                password: password
            }
        })
    },
    async setUser(username: string, name: string, mobile: string, userType: string) {
        return await prisma.user.create({
            data: {
                username: username,
                name: name,
                mobilePhone: mobile,
                userType: '外部用户'
            }
        })
    },
    async searchOtherUsersUnderOrg(userId: number, orgCode: string) {
        return await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: {
                                startsWith: orgCode
                            }
                        }
                    }
                },
                NOT: {
                    id: userId
                }
            }
        })
    },
    async searchUsersUnderOrgDirect(orgCode: string) {
        return await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: orgCode
                        }
                    }
                }
            }
        })
    },
    async searchUsersUnderOrgRecursive(orgCode: string) {
        return await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: {
                                startsWith: orgCode
                            }
                        }
                    }
                }
            }
        })
    },

    async searchUsersByOrgRoleDirect(orgCode: string, roleCode: string) {
        return await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        AND: [
                            {
                                deptartment: {
                                    orgCode: orgCode
                                },
                                status: EmploymentStatus.Enable
                            },
                            {
                                OR: [
                                    {
                                        position: {
                                            roles: {
                                                some: {
                                                    role: {
                                                        roleCode: roleCode
                                                    }
                                                }
                                            }
                                        },
                                    },
                                    {
                                        posOrg: {
                                            roles: {
                                                some: {
                                                    role: {
                                                        roleCode: roleCode
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    {
                                        roles: {
                                            some: {
                                                role: {
                                                    roleCode: roleCode
                                                }
                                            }
                                        }
                                    },
                                    {
                                        deptartment: {
                                            roles: {
                                                some: {
                                                    role: {
                                                        roleCode: roleCode
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
                                                        roleCode: roleCode
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        })
    },
    async searchUsersByOrgRoleRecursive(orgCode: string, roleCode: string) {
        return await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        AND: [
                            {
                                deptartment: {
                                    orgCode: {
                                        startsWith: orgCode
                                    }
                                },
                                status: EmploymentStatus.Enable
                            },
                            {
                                OR: [
                                    {
                                        position: {
                                            roles: {
                                                some: {
                                                    role: {
                                                        roleCode: roleCode
                                                    }
                                                }
                                            }
                                        },
                                    },
                                    {
                                        posOrg: {
                                            roles: {
                                                some: {
                                                    role: {
                                                        roleCode: roleCode
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    {
                                        roles: {
                                            some: {
                                                role: {
                                                    roleCode: roleCode
                                                }
                                            }
                                        }
                                    },
                                    {
                                        deptartment: {
                                            roles: {
                                                some: {
                                                    role: {
                                                        roleCode: roleCode
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
                                                        roleCode: roleCode
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        })
    },
    async searchUsersByOrgPosDirect(orgCode: string, posCode: string) {
        return await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: orgCode
                        },
                        position: {
                            posCode: posCode
                        }
                    }
                }
            }
        })
    },
    async searchUsersByOrgPosRecursive(orgCode: string, posCode: string) {
        return await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: {
                                startsWith: orgCode
                            }
                        },
                        position: {
                            posCode: posCode
                        }
                    }
                }
            }
        })
    },

}