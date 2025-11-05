import { Hono } from 'hono'
import { prisma } from '../extensions'
import { getUserDTO } from '../dto'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { makeResponse } from '../utils'
import { ResponseSchema, createResponseSchema, OrganizationInputSchema, UserOutSchema } from '../schema'

const app = new OpenAPIHono()

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
        const user = await prisma.user.findFirst({
            where: {
                username: username
            }
        })
        return user ? c.json(makeResponse(200, getUserDTO(user))) : c.json(makeResponse(404, {}, 'not found'))
    })


app.openapi(
    createRoute({
        method: 'get',
        path: '/search-users/org-roles',
        tags: ['Internal'],
        request: {
            query: z.object({
                roleCode: z.string().openapi({ example: 'tender:dept-approval' }),
                orgCode: z.string().openapi({ example: 'SR23' }),
                orgScope: z.enum(['direct', 'recursive']).default('direct').optional().openapi({ example: 'direct or recursive' }),
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
        const orgCondition = orgScope === 'direct' ? orgCode : {
            startsWith: orgCode
        }
        const users = await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        AND: [
                            {
                                deptartment: {
                                    orgCode: orgCondition
                                }
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
        console.log(users.map(u => getUserDTO(u)))
        return c.json(makeResponse(200, users.map(u => getUserDTO(u))))
    })


app.openapi(
    createRoute({
        method: 'get',
        path: '/search-users/under-org',
        tags: ['Internal'],
        request: {
            query: z.object({
                orgCode: z.string().openapi({ example: 'SR23' }),
                orgScope: z.enum(['direct', 'recursive']).default('direct').optional().openapi({ example: 'direct or recursive' }),
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
        const orgCondition = orgScope === 'direct' ? orgCode : {
            startsWith: orgCode
        }
        const users = await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: orgCondition,
                            isVirtual: false
                        }
                    }
                }
            }
        })
        return c.json(makeResponse(200, users.map(u => getUserDTO(u))))
    })

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
                            username: z.string().openapi({ example: '1234' }),
                            name: z.string().openapi({ example: '供应商A' }),
                            mobile: z.string().openapi({ example: '12345678' }),
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
        const body = c.req.valid('json')
        const existingUser = await prisma.user.findMany(
            {
                where: {
                    OR: [
                        {
                            username: body.username
                        },
                        {
                            mobilePhone: body.mobile
                        }
                    ]
                }
            }
        )
        if (existingUser.length !== 0) {
            return c.json(makeResponse(9999, {}, '已存在重复用户名或手机号'))
        }
        const suppPos = await prisma.position.findFirst({
            where: {
                posCode: 'E031'
            }
        })
        if (!suppPos) {
            return c.json(makeResponse(9999, '无有效供应商岗位'))
        }
        const user = await prisma.user.create({
            data: {
                username: body.username,
                name: body.name,
                mobilePhone: body.mobile,
                userType: '外部用户',
                employments: {
                    create: {
                        posId: suppPos.id,
                        deptId: 96,
                        compId: 1
                    }

                }
            }
        })
        if (!user) {
            return c.json(makeResponse(9999, '系统错误，注册失败'))
        }
        return c.json(makeResponse())
    })

export default app