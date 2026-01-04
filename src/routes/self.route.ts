import { success } from '../utils/response.utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { createResponseSchema } from '../utils/response.utils'
import { userService } from '../services/user.service'
import { mobileService } from '../services/mobile.service'
import { getCookie } from 'hono/cookie'
import { UserDetailDtoSchema, UserDtoSchema, type UserDto } from '../types/user.type'
import { employmentService } from '../services/employment.service'
import { organizationService } from '../services/organization.service'
import { cacheService } from '../services/cache.service'

import { EmploymentDtoSchema } from '../types/employment.type'

const app = new OpenAPIHono()

/*
path: /user-info
method: GET
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
                        schema: createResponseSchema(UserDetailDtoSchema),
                    },
                },
                description: '本用户信息',
            },
        },
    }),
    async (c) => {
        const sessionId = getCookie(c, 'session') ?? ''
        const data = await cacheService.getSessionById(sessionId)
        return c.json(success(data))
    }
)

/*
path: /password/change
method: POST
function: 设置密码 
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
                        schema: createResponseSchema(z.boolean()),
                    },
                },
                description: '密码设置成功',
            },
        },
    }),
    async (c) => {
        const userDTO: UserDto = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const { oldPassword, newPassword } = c.req.valid('json')
        const data = await userService.setPassword(userDTO.username, oldPassword, newPassword)
        return c.json(success(data))
    }
)

/*
path: /mobile/send-message
method: POST
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
                        schema: createResponseSchema(z.boolean()),
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
method: POST
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
                        schema: createResponseSchema(z.boolean()),
                    },
                },
                description: '新手机设置成功',
            }
        }
    }),
    async (c) => {
        const { phoneNumber, code } = c.req.valid('json')
        const sessionId = getCookie(c, 'session') as string
        const userDTO: UserDto = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const newUserDTO = await userService.setMobile(userDTO, phoneNumber, code)
        const data = await cacheService.updateSession(sessionId, JSON.stringify(newUserDTO))
        return c.json(success(data))
    }
)

/*
path: /search-other-users/under-org
method: GET
function: 搜索某个组织下的其他用户 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/search-other-users/under-org',
        tags: ['Self'],
        request: {
            query: z.object({
                orgCode: z.string().openapi({ example: 'SR23' }),
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.array(UserDtoSchema)),
                    },
                },
                description: '符合条件用户列表',
            },
        },
    }),
    async (c) => {
        const user: UserDto = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const { orgCode } = c.req.valid('query')
        const data = await userService.getOtherUsersByOrg(orgCode, user)
        return c.json(success(data))
    }
)

/*
path: /employments/by-privilege
method: GET
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
                        schema: createResponseSchema(z.array(EmploymentDtoSchema)),
                    },
                },
                description: '符合条件用户列表',
            }
        }
    }),
    async (c) => {
        const { privCode, codeType } = c.req.valid('query')
        const user: UserDto = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const data = await employmentService.getEmploymentsByUserAndPrivilege(user.username, privCode, codeType)
        return c.json(success(data))
    }
)

/*
path: /search-organizations
method: GET
function: 查询某个公司的下属组织 
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
method: GET
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
        const data = await organizationService.getTopFormalOrganizations()
        return c.json(success(data))
    }
)

/*
path: /organizations/by-parent
method: POST
function: 获取某个组织的所有子组织
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
                            parentCodes: z.array(z.string()).openapi({ example: ['SR', 'SB'] })
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
method: GET
function: 搜索某个组织下的所有用户 
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
                        schema: createResponseSchema(z.array(UserDtoSchema)),
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
