import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { makeResponse } from '../utils'
import { ResponseSchema, createResponseSchema, OrganizationInputSchema, UserOutSchema } from '../schema'
import { EmploymentStatus } from '../constant'
import { mobileService } from '../services/mobile.service'
import { userService } from '../services/user.service'
import { organizationService } from '../services/organization.service'
import { employmentService } from '../services/employment.service'

const app = new OpenAPIHono()

/*
path: /user-info
function: 获取用户详情
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/user-info',
        tags: ['Internal'],
        request: {
            query: z.object({
                username: z.string().openapi({ example: '123456' }),
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(UserOutSchema),
                    },
                },
                description: '指定用户信息',
            },
        },
    }),
    async (c) => {
        const { username } = c.req.valid('query')
        const res = await userService.getUserDetailByUsername(username)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

/*
path: /search-users/org-position
function: 根据组织岗位搜索用户
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/search-users/org-position',
        tags: ['Internal'],
        request: {
            query: z.object({
                posCode: z.string().openapi({ example: 'E001' }),
                orgCode: z.string().openapi({ example: 'SR23' }),
                orgScope: z.enum(['direct', 'recursive']).default('direct').openapi({ example: 'direct or recursive' }),
                resourceCode: z.string().optional().openapi({ example: 'tender:flow:SR_CZLX' })
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(UserOutSchema),
                    },
                },
                description: '符合条件用户列表',
            }
        }
    }),
    async (c) => {
        const { posCode, orgCode, orgScope } = c.req.valid('query')
        const res = await userService.searchUserByOrgPos(orgCode, posCode, orgScope)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

/*
path: /search-users/org-roles
function: 根据组织角色搜索用户
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/search-users/org-roles',
        tags: ['Internal'],
        request: {
            query: z.object({
                roleCode: z.string().openapi({ example: 'tender:dept-approval' }),
                orgCode: z.string().openapi({ example: 'SR23' }),
                orgScope: z.enum(['direct', 'recursive']).default('direct').openapi({ example: 'direct or recursive' }),
                resourceCode: z.string().optional().openapi({ example: 'tender:flow:SR_CZLX' })
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(UserOutSchema),
                    },
                },
                description: '符合条件用户列表',
            }
        }
    }),
    async (c) => {
        const { roleCode, orgCode, orgScope } = c.req.valid('query')
        const res = await userService.searchUserByOrgRole(orgCode, roleCode, orgScope)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

/*
path: /search-users/under-org
function: 根据组织搜索用户
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/search-users/under-org',
        tags: ['Internal'],
        request: {
            query: z.object({
                orgCode: z.string().openapi({ example: 'SR23' }),
                orgScope: z.enum(['direct', 'recursive']).default('direct').openapi({ example: 'direct or recursive' }),
            }).openapi('Username')
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.array(UserOutSchema)),
                    },
                },
                description: '符合条件用户列表',
            },
        },
    }),
    async (c) => {
        const { orgCode, orgScope } = c.req.valid('query')
        const res = await userService.searchUsersUnderOrg(orgCode, orgScope)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

/*
path: /purveyor/register
function: 供应商注册
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/purveyor/register',
        tags: ['Internal'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            orgCode: z.string().openapi({ example: '统一社会信用代码' }),
                            orgName: z.string().openapi({ example: '供应商A' }),
                        })
                    }
                }
            },
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: ResponseSchema,
                    },
                },
                description: '供应商注册成功',
            },
        },
    }),
    async (c) => {
        const { orgCode, orgName } = c.req.valid('json')
        const res = await organizationService.purveyorRegister(orgCode, orgName)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

/*
path: /purveyor/contact/register
function: 供应商联系人注册
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/purveyor/contact/register',
        tags: ['Internal'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            username: z.string().openapi({ example: '身份证号' }),
                            orgCode: z.string().openapi({ example: '供应商统一社会信用代码' }),
                            mobile: z.string().openapi({ example: '12345678' }),
                            name: z.string().openapi({ example: '1234' }),
                        })
                    }
                }
            },
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: ResponseSchema,
                    },
                },
                description: '供应商注册成功',
            },
        },
    }),
    async (c) => {
        const { username, mobile, name, orgCode } = c.req.valid('json')
        const res = await userService.purveyorConcatRegister(username, mobile, name, orgCode)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

/*
path: /search-employments/user-privilege
function: 根据用户域权限搜索任职关系
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/search-employments/user-privilege',
        tags: ['Internal'],
        request: {
            query: z.object({
                username: z.string().openapi({ example: '138550' }),
                privCode: z.string().openapi({ example: '123' }),
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
        const { username, privCode } = c.req.valid('query')
        const res = await employmentService.getEmploymentsByUserAndPrivilege(username, privCode, 'full')
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

export default app