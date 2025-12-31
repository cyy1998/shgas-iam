import { EmploymentStatus } from "../constants/employment.status"
import { UserStatus } from "../constants/user.status"
import { prisma, type PrismaTransaction } from '../libs/database/prisma'

export const userRepository = {
    async getUserByUsername(username: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findFirst({
            where: {
                username: username,
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async getUserByWxId(wxId: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findFirst({
            where: {
                wxId: wxId,
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async getUserByMobile(mobile: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findFirst({
            where: {
                mobilePhone: mobile,
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async setPassword(userId: number, password: string, tx: PrismaTransaction = prisma) {
        return await tx.user.update({
            where: {
                id: userId,
                status: UserStatus.Enable,
                isDelete: false
            },
            data: {
                password: password
            }
        })
    },
    async setMobile(userId: number, phoneNumber: string, tx: PrismaTransaction = prisma) {
        return await tx.user.update({
            where: {
                id: userId,
                status: UserStatus.Enable,
                isDelete: false
            },
            data: {
                mobilePhone: phoneNumber
            }
        })
    },
    async setUser(username: string, name: string, mobile: string, userType: string, tx: PrismaTransaction = prisma) {
        return await tx.user.create({
            data: {
                username: username,
                name: name,
                mobilePhone: mobile,
                userType: userType
            }
        })
    },

    async getUsersByOrg(orgCode: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: orgCode
                        }
                    }
                },
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async getUsersByOrgAndAllSub(orgCode: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            descendantClosures: {
                                some: {
                                    ancestor: {
                                        orgCode: orgCode
                                    }
                                }
                            }
                        }
                    }
                },
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async getOtherUsersByOrgAndAllSub(userId: number, orgCode: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            descendantClosures: {
                                some: {
                                    ancestor: {
                                        orgCode: orgCode
                                    }
                                }
                            }
                        }
                    }
                },
                NOT: {
                    id: userId
                },
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async getUsersByOrgRole(orgCode: string, roleCode: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findMany({
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
                },
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async getUsersByOrgAndAllSubRole(orgCode: string, roleCode: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findMany({
            where: {
                // userType: '正式员工',
                employments: {
                    some: {
                        AND: [
                            {
                                deptartment: {
                                    descendantClosures: {
                                        some: {
                                            ancestor: {
                                                orgCode: orgCode
                                            }
                                        }
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
                                            descendantClosures: {
                                                some: {
                                                    OR: [
                                                        {
                                                            depth: 0,
                                                            ancestor: {
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
                                                            depth: {
                                                                gt: 0
                                                            },
                                                            ancestor: {
                                                                roles: {
                                                                    some: {
                                                                        isAllSub: true,
                                                                        role: {
                                                                            roleCode: roleCode
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                            // roles: {
                                            //     some: {
                                            //         role: {
                                            //             roleCode: roleCode
                                            //         }
                                            //     }
                                            // }
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                },
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async getUsersByOrgPos(orgCode: string, posCode: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findMany({
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
                },
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async getUsersByOrgAndAllSubPos(orgCode: string, posCode: string, tx: PrismaTransaction = prisma) {
        return await tx.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            descendantClosures: {
                                some: {
                                    ancestor: {
                                        orgCode: orgCode
                                    }
                                }
                            }
                        },
                        position: {
                            posCode: posCode
                        }
                    }
                },
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },

}