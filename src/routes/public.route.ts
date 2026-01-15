import { success } from '../utils/response.utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { createResponseSchema } from '../types/response.type'
import { userService } from '../services/user.common.service'
import { mobileService } from '../services/mobile.service'
import { getCookie } from 'hono/cookie'
import { UserDetailDtoSchema, UserDtoSchema, UserQueryDtoSchema, type UserDetailDto, type UserDto } from '../types/user.common.type'
import { employmentService } from '../services/employment.common.service'
import { organizationService } from '../services/organization.service'
import { cacheService } from '../services/cache.service'

import { EmploymentDtoSchema } from '../types/employment.common.type'
import { OrganizationDtoSchema, OrganizationQueryDtoSchema } from '../types/organization.type'
import { AuthzUnauthorizedError } from '../errors/AuthzUnauthorizedError'
import { redis } from '../libs/cache/redis'

interface AppEnv {
    Variables: {
        userId: number,
        username: string,
        userDetailDto: UserDetailDto
    }
}

const app = new OpenAPIHono<AppEnv>()

app.use('/*', async (c, next) => {
    const sessionId = getCookie(c, 'session') ?? null
    // const path = c.req.header('X-Forwarded-Uri')
    // const userString = c.req.header('X-User-Info')
    if (!sessionId) {
        throw new AuthzUnauthorizedError('未登录')
    }
    // if (!userString) {
    //     throw new AuthzUnauthorizedError('未登录')
    // }
    const userString = await redis.get(`session:${sessionId}`)
    if (!userString) {
        throw new AuthzUnauthorizedError('未登录')
    }
    const userDto: UserDetailDto = JSON.parse(userString)
    // const userDto: UserDto = JSON.parse(Buffer.from(userString, 'base64').toString('utf8'))
    c.set('userId', userDto.id)
    c.set('username', userDto.username)
    c.set('userDetailDto', userDto)
    return await next()
})

/*
path: /user-info
method: GET
function: 获取当前已登录用户信息 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/user-info',
        tags: ['Public'],
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
        // const sessionId = getCookie(c, 'session') ?? ''
        // const data = await cacheService.getSessionById(sessionId)
        const data = c.get('userDetailDto')
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
        tags: ['Public'],
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
        const { oldPassword, newPassword } = c.req.valid('json')
        const data = await userService.setPassword(c.get('username'), oldPassword, newPassword)
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
        tags: ['Public'],
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
        tags: ['Public'],
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
        const newUserDto = await userService.setMobile(c.get('userId'), phoneNumber, code)
        const data = await cacheService.updateSession(sessionId, JSON.stringify(newUserDto))
        return c.json(success(data))
    }
)

//待废弃
/*
path: /employments/by-privilege
method: GET
function: 查询具有某个权限的任职关系 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/employments/by-privilege',
        tags: ['Public'],
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
        const data = await employmentService.getEmploymentsByUserAndPrivilege(c.get('username'), privCode, codeType)
        return c.json(success(data))
    }
)

//待废弃
/*
path: /search-organizations
method: GET
function: 查询某个公司的下属组织 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/search-organizations',
        tags: ['Public'],
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

//待废弃
/*
path: /organizations/top
method: GET
function: 获取一级公司列表 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/organizations/top',
        tags: ['Public'],
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
path: /organizations/search
method: POST
function: 按条件搜索某组织
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/organizations/search',
        tags: ['Public'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: OrganizationQueryDtoSchema
                    }
                }
            }
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.array(OrganizationDtoSchema)),
                    },
                },
                description: '所有符合条件组织列表',
            },
        },
    }),
    async (c) => {
        const organizationQueryDto = c.req.valid('json')
        const data = await organizationService.searchOrganizations(organizationQueryDto)
        return c.json(success(data))
    }
)

//待废弃
/*
path: /organizations/getByCode
method: GET
function: 根据code搜索某个组织的信息 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/organizations/getByCode',
        tags: ['Public'],
        request: {
            query: z.object({
                orgCode: z.string()
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema:
                            createResponseSchema(OrganizationDtoSchema)
                    },
                },
                description: '本公司下属组织列表',
            },
        },
    }),
    async (c) => {
        const { orgCode } = c.req.valid('query')
        const data = await organizationService.getOrganizationByCode(orgCode)
        return c.json(success(data))
    }
)

//待废弃
/*
path: /organizations/by-parent
method: POST
function: 获取某个组织的所有子组织
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/organizations/by-parent',
        tags: ['Public'],
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
        const data = await organizationService.getOrganizationsByParentCodes(parentCodes)
        return c.json(success(data))
    }
)

/*
path: /users/search
method: POST
function: 获取某个组织的所有子组织
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/users/search',
        tags: ['Public'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: UserQueryDtoSchema
                    }
                }
            }
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.array(UserDtoSchema)),
                    },
                },
                description: '所有子组织列表',
            },
        },
    }),
    async (c) => {
        const userQueryDto = c.req.valid('json')
        const data = await userService.searchUsers(userQueryDto)
        return c.json(success(data))
    }
)
/*
path: /users/search
method: POST
function: 获取某个组织的所有子组织
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/users/search/sql',
        tags: ['Public'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: UserQueryDtoSchema
                    }
                }
            }
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.array(UserDtoSchema)),
                    },
                },
                description: '所有子组织列表',
            },
        },
    }),
    async (c) => {
        const userQueryDto = c.req.valid('json')
        const data = await userService.searchUsersRawSql(userQueryDto)
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
        tags: ['Public'],
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

//待废弃
/*
path: /search-other-users/under-org
method: GET
function: 搜索某个组织下的其他用户 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/search-other-users/under-org',
        tags: ['Public'],
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
        const { orgCode } = c.req.valid('query')
        const data = await userService.getOtherUsersByOrg(orgCode, c.get('userId'))
        return c.json(success(data))
    }
)


export default app
