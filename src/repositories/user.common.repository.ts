import type { User } from "../../generated/prisma"
import { Prisma } from "../../generated/prisma"
import { EmploymentStatus } from "../constants/employment.status"
import { PositionStatus } from "../constants/position.status"
import { RoleStatus } from "../constants/role.status"
import { UserStatus } from "../constants/user.status"
import { prisma, type PrismaTransaction } from '../libs/database/prisma'
import type { UserQueryDto } from "../types/user.common.type"

const searchUserQuery = `
SELECT
    DISTINCT 
        u.id as id,
        u.username as username,
        u.name as name,
        u.mobile_phone as mobilePhone,
        u.wxId as wxId,
        NULL as password,
        u.user_type as userType,
        u.order_num as orderNum,
        u.status as status,
        u.is_delete as isDelete,
        u.create_time as createTime,
        u.update_time as updateTime
FROM
    iam.\`user\` u
    JOIN iam.employment e ON u.id = e.user_id
    JOIN iam.\`position\` p ON e.pos_id = p.id
    JOIN iam.organization o1 ON e.dept_id = o1.id
    JOIN iam.organization_closure oc ON o1.id = oc.descendant_id
    JOIN iam.organization o2 ON oc.ancestor_id = o2.id
    LEFT JOIN iam.position_role pr ON p.id = pr.position_id
    LEFT JOIN iam.employment_role er ON e.id = er.employment_id
    LEFT JOIN iam.organization_role or2 ON o2.id = or2.organization_id
    LEFT JOIN iam.\`role\` r1 ON er.role_id = r1.id
    LEFT JOIN iam.\`role\` r3 ON pr.role_id = r3.id
    LEFT JOIN iam.\`role\` r2 ON r2.id = or2.role_id
WHERE
	u.is_delete = 0
	AND e.is_delete = 0
	AND (r1.is_delete = 0 OR r1.is_delete IS NULL)
	AND (r2.is_delete = 0 OR r2.is_delete IS NULL)
	AND (r3.is_delete = 0 OR r3.is_delete IS NULL)
	AND o1.is_delete = 0
	AND o2.is_delete = 0
	AND u.status = 1
	AND e.status = 1
	AND (r1.status = 1 OR r1.status IS NULL )
	AND (r2.status = 1 OR r2.status IS NULL )
	AND (r3.status = 1 OR r3.status IS NULL )
	AND o1.status = 1
	AND o2.status = 1
`

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
    async searchUsers(
        userQueryDto: UserQueryDto,
        tx: PrismaTransaction = prisma
    ) {
        return await tx.user.findMany({
            where: {
                username: {
                    in: userQueryDto.usernames
                },
                mobilePhone: {
                    in: userQueryDto.phones
                },
                wxId: {
                    in: userQueryDto.wxIds
                },
                employments: {
                    some: {
                        status: EmploymentStatus.Enable,
                        isDelete: false,
                        deptartment: {
                            descendantClosures: {
                                some: {
                                    ancestor: {
                                        orgCode: {
                                            in: userQueryDto.ancestorOrgCodes
                                        }
                                    },
                                    depth: {
                                        in: userQueryDto.ancestorOrgDepths
                                    }
                                }
                            }
                        },
                        position: {
                            status: PositionStatus.Enable,
                            isDelete: false,
                            posCode: {
                                in: userQueryDto.positionCodes
                            }
                        },
                        OR: [
                            {
                                position: {
                                    roles: {
                                        some: {
                                            role: {
                                                status: RoleStatus.Enable,
                                                isDelete: false,
                                                roleCode: {
                                                    in: userQueryDto.roleCodes
                                                }
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
                                                status: RoleStatus.Enable,
                                                isDelete: false,
                                                roleCode: {
                                                    in: userQueryDto.roleCodes
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
                                            status: RoleStatus.Enable,
                                            isDelete: false,
                                            roleCode: {
                                                in: userQueryDto.roleCodes
                                            }
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
                                                                    status: RoleStatus.Enable,
                                                                    isDelete: false,
                                                                    roleCode: {
                                                                        in: userQueryDto.roleCodes
                                                                    }
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
                                                                    status: RoleStatus.Enable,
                                                                    isDelete: false,
                                                                    roleCode: {
                                                                        in: userQueryDto.roleCodes
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        ]
                    }
                },
                status: UserStatus.Enable,
                isDelete: false
            }
        })
    },
    async searchUsersRawSql(
        userQueryDto: UserQueryDto,
        tx: PrismaTransaction = prisma
    ) {
        let query = searchUserQuery
        if (userQueryDto.roleCodes) {
            query += `
            AND (
			(
				r2.role_code IN (${userQueryDto.roleCodes.map(r => "'" + r + "'").join(',')})
				AND (or2.is_all_sub = 1 OR (or2.is_all_sub = 0 AND oc.\`depth\` = 0))
			)
			OR
				r1.role_code IN (${userQueryDto.roleCodes.map(r => "'" + r + "'").join(',')})
			OR
				r3.role_code IN (${userQueryDto.roleCodes.map(r => "'" + r + "'").join(',')})
	        )
            `
        }
        if (userQueryDto.positionCodes) {
            query += `
            AND p.post_code IN (${userQueryDto.positionCodes.map(r => "'" + r + "'").join(',')})
            `
        }
        if (userQueryDto.ancestorOrgCodes) {
            query += `
            AND o2.org_code IN (${userQueryDto.ancestorOrgCodes.map(r => "'" + r + "'").join(',')})
            `
        }
        if (userQueryDto.ancestorOrgCodes) {
            query += `
            AND o2.org_code IN (${userQueryDto.ancestorOrgCodes.map(r => "'" + r + "'").join(',')})
            `
        }
        if (userQueryDto.ancestorOrgDepths) {
            query += `
            AND oc.\`depth\` IN (${userQueryDto.ancestorOrgDepths.map(r => "'" + r + "'").join(',')})
            `
        }
        if (userQueryDto.usernames) {
            query += `
            AND u.username IN (${userQueryDto.usernames.map(r => "'" + r + "'").join(',')})
            `
        }
        if (userQueryDto.phones) {
            query += `
            AND u.mobile_phone IN (${userQueryDto.phones.map(r => "'" + r + "'").join(',')})
            `
        }
        if (userQueryDto.wxIds) {
            query += `
            AND u.wxId IN (${userQueryDto.wxIds.map(r => "'" + r + "'").join(',')})
            `
        }
        const q = Prisma.sql([query])
        return await tx.$queryRaw<User[]>(q)
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