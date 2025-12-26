import { success } from '../utils/response.utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ResponseSchema, OrganizationInputSchema, UserOutSchema } from '../schema'
import { createResponseSchema } from '../utils/response.utils'
import { userService } from '../services/user.service'
import { mobileService } from '../services/mobile.service'
import { getCookie } from 'hono/cookie'
import { authService } from '../services/auth.service'
import type { UserDTO } from '../types/user.type'
import { employmentService } from '../services/employment.service'
import { organizationService } from '../services/organization.service'
import { cacheService } from '../services/cache.service'

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
        return c.json(success(JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))))
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
                description: '密码设置成功',
            },
        },
    }),
    async (c) => {
        const userDTO: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const { oldPassword, newPassword } = c.req.valid('json')
        const data = await userService.setPassword(userDTO, oldPassword, newPassword)
        return c.json(success(data))
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
        const data = await mobileService.sendCodeWithOutExistingPhone(phoneNumber)
        return c.json(success(data))
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
                description: '新手机设置成功',
            }
        }
    }),
    async (c) => {
        const { phoneNumber, code } = c.req.valid('json')
        const sessionId = getCookie(c, 'session') as string
        const userDTO: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const newUserDTO = await userService.setMobile(userDTO, phoneNumber, code)
        const data = await cacheService.updateSession(sessionId, JSON.stringify(newUserDTO))
        return c.json(success(data))
    }
)



/*
path: /search-other-users/under-org
function: 搜索某个组织下的其他用户 
*/
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
        const data = await userService.getOtherUsersByOrg(orgCode, user)
        return c.json(success(data))
    }
)

/*
path: /employments/by-privilege
function: 查询具有某个权限的任职关系 
*/
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
        const data = await employmentService.getEmploymentsByUserAndPrivilege(user.username, privCode, codeType)
        return c.json(success(data))
    }
)

/*
path: /employments/by-privilege
function: 查询具有某个权限的任职关系 
*/
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
                description: '本公司下属组织列表',
            },
        },
    }),
    async (c) => {
        const { orgLevel, comCode } = c.req.valid('query')
        const data = await organizationService.getFormalOrganizationsByCode(comCode, orgLevel)
        return c.json(success(data))
    }
)

/*
path: /organizations/top
function: 获取一级公司列表 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/organizations/top',
        tags: ['Self'],
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(
                            z.object({
                                id: z.int(),
                                orgCode: z.string(),
                                orgName: z.string(),
                                orgType: z.string(),
                                level: z.int()
                            })
                        ),
                    },
                },
                description: '本用户信息',
            },
        },
    }),
    async (c) => {
        const data = await organizationService.getFormalOrganizationsByCode('', 1)
        return c.json(success(data))
    }
)

/*
path: /organizations/by-parent
function: 获取一级公司列表 
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/organizations/by-parent',
        tags: ['Self'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            parentCodes: z.array(z.string()).openapi({ example: '123' })
                        })
                    }
                }
            }
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(
                            z.array(z.object({
                                id: z.int(),
                                orgCode: z.string(),
                                orgName: z.string(),
                                orgType: z.string(),
                                level: z.int()
                            }))
                        ),
                    },
                },
                description: '所有子组织列表',
            },
        },
    }),
    async (c) => {
        const { parentCodes } = c.req.valid('json')
        const data = await organizationService.getSubOrganizationsByParent(parentCodes)
        return c.json(success(data))
    }
)

/*
path: /users/by-org
function: 搜索某个组织下的其他用户 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/users/by-org',
        tags: ['Self'],
        request: {
            query: z.object({
                orgCode: z.string().openapi({ example: '123' })
            })
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
        const { orgCode } = c.req.valid('query')
        const data = await userService.getUsersByOrg(orgCode, 'direct')
        return c.json(success(data))
    }
)

export default app
