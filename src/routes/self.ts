import { Hono } from 'hono'
import { OrganizationQuery, UserDTO, getEmploymentDTO, getOrgDTO, getUserDTO } from '../repositories/dto'
import { User } from '../../generated/prisma'
import { redis, prisma } from '../extensions'
import { makeResponse } from '../utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ResponseSchema, createResponseSchema, OrganizationInputSchema, UserOutSchema } from '../schema'
import { userService } from '../services/user.service'
import { mobileService } from '../services/mobile.service'
import { getCookie } from 'hono/cookie'

const app = new OpenAPIHono()

app.openapi(
    createRoute({
        method: 'get',
        path: '/user-info',
        tags: ['Self'],
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: ResponseSchema,
                    },
                },
                description: '本用户信息',
            },
        },
    }),
    async (c) => {
        return c.json(makeResponse(200, JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))))
    }
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/password/change',
        tags: ['Self'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            oldPassword: z.string().openapi({ example: '1234' }),
                            newPassword: z.string().openapi({ example: '1234' })
                        })
                    }
                }
            },
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '本用户信息',
            },
        },
    }),
    async (c) => {
        const userDTO: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const { oldPassword, newPassword } = c.req.valid('json')
        const res = await userService.changePassword(userDTO, oldPassword, newPassword)
        if (!res) {
            return c.json(makeResponse(9999, {}, '原密码错误'))
        }
        return c.json(makeResponse(200, {}, 'success'))
    }
)

app.openapi(
    createRoute({
        method: 'post',
        path: '/mobile/send-message',
        tags: ['Self'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            phoneNumber: z.string().openapi({ example: '17721462865' }),
                        })
                    }
                }
            },
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '发送短信成功',
            }
        }
    }),
    async (c) => {
        const { phoneNumber } = c.req.valid('json')
        if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(400, {}, '无效手机号'))
        }
        const res: boolean = await mobileService.sendVerificationCode(phoneNumber)
        if (!res) {
            return c.json(makeResponse(9999, {}, '短信发送失败'))
        }
        return c.json(makeResponse(200, {}, 'success'))
    })

app.openapi(
    createRoute({
        method: 'post',
        path: '/mobile/set',
        tags: ['Self'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            phoneNumber: z.string().openapi({ example: '17721462865' }),
                            code: z.string().openapi({ example: '1234' }),
                        })
                    }
                }
            },
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '发送短信成功',
            }
        }
    }),
    async (c) => {
        const { phoneNumber, code } = c.req.valid('json')
        const sessionId = getCookie(c, 'session')
        console.log(sessionId)
        if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(400, {}, '无效手机号'))
        }
        if (await mobileService.checkExistingPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(400, {}, '手机号已存在'))
        }
        if (!await mobileService.cehckVerificationCode(phoneNumber, code)) {
            return c.json(makeResponse(9999, {}, '验证码错误'))
        }
        const userDTO: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const newUserDTO = await userService.setMobile(userDTO, phoneNumber)
        await userService.updateUserSession(sessionId as string, newUserDTO)
        return c.json(makeResponse(200, {}, 'success'))
    })

app.openapi(
    createRoute({
        method: 'get',
        path: '/search-other-users/under-org',
        tags: ['Self'],
        request: {
            query: OrganizationInputSchema
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.array(UserOutSchema)),
                    },
                },
                description: '本用户信息',
            },
        },
    }),
    async (c) => {
        const user: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const { orgCode } = c.req.valid('query')
        const users = await prisma.user.findMany({
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
                    username: user.username
                }
            },

        })
        return c.json(makeResponse(200, users.map(u => getUserDTO(u))))
    }
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/employments/by-privilege',
        tags: ['Self'],
        request: {
            query: z.object({
                privCode: z.string().openapi({ example: '123' }),
                codeType: z.enum(['full', 'prefix', 'suffix']).default('full')
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.array(z.object({
                            posId: z.int(),
                            posCode: z.string(),
                            posName: z.string(),
                            orgId: z.int(),
                            orgCode: z.string(),
                            orgName: z.string(),
                            compId: z.int(),
                            compCode: z.string(),
                            compName: z.string(),
                        }))),
                    },
                },
                description: '符合条件用户列表',
            }
        }
    }),
    async (c) => {
        const { privCode, codeType } = c.req.valid('query')
        let privCondition = null
        if (codeType === 'full') {
            privCondition = privCode
        } else if (codeType === 'prefix') {
            privCondition = {
                startsWith: privCode
            }
        } else {
            privCondition = {
                endsWith: privCode
            }
        }
        const user: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const employments = await prisma.employment.findMany({
            where: {
                user: {
                    username: user.username
                },
                OR: [
                    {
                        deptartment: {
                            roles: {
                                some: {
                                    role: {
                                        privileges: {
                                            some: {
                                                privilege: {
                                                    privilegeCode: privCondition
                                                }
                                            }
                                        }
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
                                        privileges: {
                                            some: {
                                                privilege: {
                                                    privilegeCode: privCondition
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        position: {
                            roles: {
                                some: {
                                    role: {
                                        privileges: {
                                            some: {
                                                privilege: {
                                                    privilegeCode: privCondition
                                                }
                                            }
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
                                    privileges: {
                                        some: {
                                            privilege: {
                                                privilegeCode: privCondition
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            include: {
                deptartment: true,
                company: true,
                position: true,
                user: true
            }
        })
        console.log(employments)
        return c.json(makeResponse(200, employments.map(e => getEmploymentDTO(e))))
    })

app.openapi(
    createRoute({
        method: 'get',
        path: '/organizations',
        tags: ['Self'],
        request: {
            query: z.object({
                orgLevel: z.coerce.number().int().openapi({ example: "2" }),
                comCode: z.string().optional().openapi({ example: "SR" })
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema:
                            createResponseSchema(z.array(
                                z.object({
                                    id: z.int(),
                                    orgCode: z.string(),
                                    orgName: z.string(),
                                    orgType: z.string(),
                                    level: z.int()
                                })
                            ))
                    },
                },
                description: '本公司用户列表',
            },
        },
    }),
    async (c) => {
        const user: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const { orgLevel, comCode } = c.req.valid('query')
        const orgCodes = user.positions?.map(p => p.orgCode.substring(0, orgLevel * 2))
        const organizations = await prisma.organization.findMany({
            where: {
                orgCode: {
                    in: orgCodes,
                    startsWith: comCode
                },
                level: orgLevel
            }
        })
        return c.json(makeResponse(200, organizations.map(o => getOrgDTO(o))))
    }
)

export default app
