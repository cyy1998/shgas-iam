import { redis, prisma } from '../extensions'
import { getEmploymentDTO, getOrgDTO, getPrivDTO, getUserDTO, PrivDTO, UserDTO } from '../dto'
import axios from 'axios'
import { hash, compare } from 'bcrypt-ts'
import { EmploymentStatus, PASSWORD_HASH_ROUNDS } from '../constant'
import { User } from '../generated/prisma'

export const userService = {
    async createUserSession(userQueryCondition: object, verifyPassword: boolean = true, password: string = '') {
        const user = await prisma.user.findFirst({
            where: userQueryCondition,
            include: {
                employments: {
                    include: {
                        position: true,
                        deptartment: true,
                        company: true
                    }
                }
            }
        })
        if (!user) {
            return {
                userDTO: null,
                user: null,
                sessionId: null,
                message: '用户不存在',
                code: 401
            }
        }
        if (verifyPassword) {
            const isMatch = user.password ? await compare(password, user.password ?? '') : password === '1111'
            if (!isMatch) {
                return {
                    userDTO: null,
                    user: null,
                    sessionId: null,
                    message: '密码错误',
                    code: 401
                }
            }
        }
        const userDTO = getUserDTO(user)
        userDTO.positions = user.employments.map(e => getEmploymentDTO(e))
        // const comCodes = [...new Set(userDTO.positions.map(e => e.orgCode.slice(0, 2)))]
        const privileges = await prisma.privilege.findMany({
            where: {
                roles: {
                    some: {
                        role: {
                            OR: [
                                {
                                    positions: {
                                        some: {
                                            position: {
                                                employments: {
                                                    some: {
                                                        userId: user.id,
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
                                                                userId: user.id,
                                                                status: EmploymentStatus.Enable
                                                            }
                                                        }
                                                    },
                                                    {
                                                        compEmployments: {
                                                            some: {
                                                                userId: user.id,
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
                                                        userId: user.id,
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
                                                userId: user.id,
                                                status: EmploymentStatus.Enable
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            },
            include: {
                object: true
            }
        })
        userDTO.privileges = privileges.map(p => getPrivDTO(p))
        // userDTO.companies = companies.map(c => getOrgDTO(c))
        const token = crypto.randomUUID()
        await redis.set(`session:${token}`, JSON.stringify(userDTO), 'EX', parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'))
        return {
            userDTO: userDTO,
            user: user,
            sessionId: token,
            message: 'success',
            code: 200
        }
    },

    // async getUserSession(sessionId: string): Promise<UserDTO> {
    //     return (await redis.get(`session${sessionId}`)) as UserDTO
    // },
    async updateUserSession(sessionId: string, userDTO: UserDTO) {
        await redis.set(`session:${sessionId}`, JSON.stringify(userDTO), 'EX', parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'))
    },

    async orcasLogin(userDTO: UserDTO) {
        const resp = await axios('http://176.169.99.150:18091/orcas/login', {
            method: 'POST',
            data: {
                id: userDTO.id,
                username: userDTO.username,
                name: userDTO.name,
                mobile: userDTO.mobile ?? ''
            }
        })
        if (resp.status != 200 || resp.data.code != 200 || !resp.headers["set-cookie"]) {
            return {
                res: 'fail',
                orcasSessionId: null
            }
        }
        const cookieStr = resp.headers["set-cookie"][1] ?? ''
        const match = cookieStr.match(/orcas_sso_sessionid=([^;]+)/)
        const orcasSessionId = match ? match[1] : ''
        return {
            res: 'success',
            orcasSessionId: orcasSessionId
        }
    },

    async changePassword(userDTO: UserDTO, oldPassword: string, newPassword: string): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: {
                id: userDTO.id
            }
        }) as User
        const isMatch = await compare(oldPassword, user.password ?? '')
        console.log(isMatch)
        if (!isMatch) {
            console.log(isMatch)
            return false
        }
        const newPasswordHash = await hash(newPassword, PASSWORD_HASH_ROUNDS)
        const userUpdated = await prisma.user.update({
            where: {
                id: userDTO.id
            },
            data: {
                password: newPasswordHash
            }
        })
        return true

    },

    async setMobile(userDTO: UserDTO, newMobile: string): Promise<UserDTO> {
        const userUpdated = await prisma.user.update({
            where: {
                id: userDTO.id
            },
            data: {
                mobilePhone: newMobile
            }
        })
        userDTO.mobile = newMobile
        return userDTO
    }
}