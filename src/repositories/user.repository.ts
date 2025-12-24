import { EmploymentStatus } from "../types/employment.type"
import { prisma } from "../extensions"

export const userRepository = {
    async getUserByUsername(username: string) {
        return await prisma.user.findFirst({
            where: {
                username: username
            }
        })
    },
    async getUserByWxId(wxId: string) {
        return await prisma.user.findFirst({
            where: {
                wxId: wxId
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
    async setMobile(userId: number, phoneNumber: string) {
        return await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                mobilePhone: phoneNumber
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
    async getOtherUsersByOrg(userId: number, orgCode: string) {
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
    async getUsersByOrg(orgCode: string) {
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
    async getUsersByOrgAndAllSub(orgCode: string) {
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

    async getUsersByOrgRole(orgCode: string, roleCode: string) {
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
    async getUsersByOrgAndAllSubRole(orgCode: string, roleCode: string) {
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
    async getUsersByOrgPos(orgCode: string, posCode: string) {
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
    async getUsersByOrgAndAllSubPos(orgCode: string, posCode: string) {
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