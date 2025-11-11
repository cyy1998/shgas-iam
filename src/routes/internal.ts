import { Hono } from 'hono'
import { prisma } from '../extensions'
import { getEmploymentDTO, getUserDTO } from '../repositories/dto'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { makeResponse } from '../utils'
import { ResponseSchema, createResponseSchema, OrganizationInputSchema, UserOutSchema } from '../schema'
import { EmploymentStatus } from '../constant'

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
        path: '/search-users/org-position',
        tags: ['Internal'],
        request: {
            query: z.object({
                posCode: z.string().openapi({ example: 'E001' }),
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
        const { posCode, orgCode, orgScope } = c.req.valid('query')
        const orgCondition = orgScope === 'direct' ? orgCode : {
            startsWith: orgCode
        }
        const users = await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: orgCondition
                        },
                        position: {
                            posCode: posCode
                        }
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
        const exisitngOrgs = await prisma.organization.findMany(
            {
                where: {
                    orgCode: orgCode
                }
            }
        )
        if (exisitngOrgs.length !== 0) {
            return c.json(makeResponse(9999, {}, '已存在重复供应商'))
        }
        const parentOrg = await prisma.organization.findFirst({
            where: {
                orgCode: 'GY'
            }
        })
        const organization = await prisma.organization.create({
            data: {
                orgCode: orgCode,
                orgName: orgName,
                parentId: parentOrg?.id,
                level: 2,
                orgType: '外部组织',
                isVirtual: true
            }
        })
        if (!organization) {
            return c.json(makeResponse(9999, '系统错误，注册失败'))
        }
        return c.json(makeResponse())
    })

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
        const existingUser = await prisma.user.findMany(
            {
                where: {
                    OR: [
                        {
                            username: username
                        },
                        {
                            mobilePhone: mobile
                        }
                    ]
                }
            }
        )
        if (existingUser.length !== 0) {
            return c.json(makeResponse(9999, {}, '已存在重复用户名或手机号'))
        }
        const [pos, comp, org] = await Promise.all([
            prisma.position.findFirst({
                where: {
                    posCode: 'P001'
                }
            }),
            prisma.organization.findFirst({
                where: {
                    orgCode: 'GY'
                }
            }),
            prisma.organization.findFirst({
                where: {
                    orgCode: orgCode,
                    orgType: '外部组织'
                }
            })
        ])
        if (!org) {
            return c.json(makeResponse(9999, {}, '该供应商未注册'))
        }
        if (!pos || !comp) {
            return c.json(makeResponse(9999, {}, '系统基本信息缺失'))
        }
        const user = await prisma.user.create({
            data: {
                username: username,
                name: name,
                mobilePhone: mobile,
                userType: '外部用户',
                employments: {
                    create: {
                        posId: pos.id,
                        deptId: org.id,
                        compId: comp.id
                    }

                }
            }
        })
        if (!user) {
            return c.json(makeResponse(9999, '系统错误，注册失败'))
        }
        return c.json(makeResponse())
    })

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
        const employments = await prisma.employment.findMany({
            where: {
                user: {
                    username: username
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
                                                    privilegeCode: privCode
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
                                                    privilegeCode: privCode
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
                                                    privilegeCode: privCode
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
                                                privilegeCode: privCode
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

export default app