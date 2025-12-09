import { makeResponse } from '../utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ResponseSchema, createResponseSchema, OrganizationInputSchema, UserOutSchema } from '../schema'
import { userService } from '../services/user.service'
import { mobileService } from '../services/mobile.service'
import { getCookie } from 'hono/cookie'
import { ServiceStatusCode } from "../constants/service.status"
import { authService } from '../services/auth.service'
import { UserDTO } from '../types/user.type'
import { employmentService } from '../services/employment.service'
import { organizationService } from '../services/organization.service'

const app = new OpenAPIHono()




/*
path: /user-info
function: 获取当前已登录用户信息 
*/
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

/*
path: /password/change
function: 更换密码 
*/
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
        const res = await userService.setPassword(userDTO, oldPassword, newPassword)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

/*
path: /mobile/send-message
function: 发送短信 
*/
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
        const res = await mobileService.sendVerificationCode(phoneNumber)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

/*
path: /mobile/set
function: 设置手机号 
*/
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
        const sessionId = getCookie(c, 'session') as string
        if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(ServiceStatusCode.Failure, {}, '无效手机号'))
        }
        if (await mobileService.checkExistingPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(ServiceStatusCode.Failure, {}, '手机号已存在'))
        }
        if (!await mobileService.cehckVerificationCode(phoneNumber, code)) {
            return c.json(makeResponse(ServiceStatusCode.Failure, {}, '验证码错误'))
        }
        const userDTO: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const newUserDTO = await userService.setMobile(userDTO, phoneNumber)
        const res = await authService.updateSession(sessionId, newUserDTO)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

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
        const res = await userService.searchOtherUserUnderOrg(orgCode, user)
        return c.json(makeResponse(res.code, res.data, res.message))
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
        const user: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const res = await employmentService.getEmploymentsByUserAndPrivilege(user.username, privCode, codeType)
        return c.json(makeResponse(res.code, res.data, res.message))
    })

app.openapi(
    createRoute({
        method: 'get',
        path: '/search-organizations',
        tags: ['Self'],
        request: {
            query: z.object({
                orgLevel: z.coerce.number().int().openapi({ example: "2" }),
                comCode: z.string().openapi({ example: "SR" })
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
        const { orgLevel, comCode } = c.req.valid('query')
        const res = await organizationService.searchFormalOrganization(comCode, orgLevel)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

export default app
