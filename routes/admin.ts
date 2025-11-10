import { prisma } from '../extensions'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { makeResponse } from '../utils'
import { ResponseSchema } from '../schema'

const app = new OpenAPIHono()

app.openapi(
    createRoute({
        method: 'post',
        path: '/position/set',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            posCode: z.string().openapi({ example: 'SR01-01' }),
                            posName: z.string().openapi({ example: '党委书记' })
                        }).openapi('Position')
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
                description: '设置岗位成功',
            },
        },
    }),
    async (c) => {
        const body = c.req.valid('json')
        const position = await prisma.position.create({
            data: body
        })
        return c.json(makeResponse())
    })

app.openapi(
    createRoute({
        method: 'post',
        path: '/employment/set',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            posCode: z.string().openapi({ example: 'E01' }),
                            orgCode: z.string().openapi({ example: 'SR01' }),
                            username: z.string().openapi({ example: '138550' }),
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
                description: '设置任职关系成功',
            },
        },
    }),
    async (c) => {
        const { username, orgCode, posCode } = c.req.valid('json')
        console.log(username, orgCode, posCode)
        const [employment, user, department, company, position] = await Promise.all([
            prisma.employment.findFirst({
                where: {
                    user: {
                        username: username,
                    },
                    deptartment: {
                        orgCode: orgCode
                    },
                    company: {
                        orgCode: orgCode.slice(0, 2)
                    },
                    position: {
                        posCode: posCode
                    }
                }
            }),
            prisma.user.findFirst({
                where: { username: username }
            }),
            prisma.organization.findFirst({
                where: { orgCode: orgCode }
            }),
            prisma.organization.findFirst({
                where: { orgCode: orgCode.slice(0, 2) }
            }),
            prisma.position.findFirst({
                where: { posCode: posCode }
            })
        ])
        console.log(user)
        if (!user || !department || !company || !position) {
            return c.json(makeResponse(9999, {
                message: '实体不存在'
            }))
        }
        if (employment) {
            return c.json(makeResponse(9999, {
                message: '相同任职关系已存在'
            }))
        }
        const res = await prisma.employment.create({
            data: {
                userId: user.id,
                posId: position.id,
                deptId: department.id,
                compId: company.id
            }
        })
        return c.json(makeResponse())
    })

app.openapi(
    createRoute({
        method: 'post',
        path: '/role/pos-org/set',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            posCode: z.string().openapi({ example: 'E01' }),
                            orgCode: z.string().openapi({ example: 'SR01' }),
                            roleCode: z.string().openapi({ example: 'dept-head' }),
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
                description: '设置角色成功',
            },
        },
    }),
    async (c) => {
        const { roleCode, orgCode, posCode } = c.req.valid('json')
        const [role, organization, position] = await Promise.all([
            prisma.role.findFirst({
                where: {
                    roleCode: roleCode
                }
            }),
            prisma.organization.findFirst({
                where: {
                    orgCode: orgCode
                }
            }),
            prisma.position.findFirst({
                where: {
                    posCode: posCode
                }
            })
        ])
        if (!role || !organization || !position) {
            return c.json(makeResponse(9999, {
                message: '实体不存在'
            }))
        }
        let orgPos = await prisma.posOrgComposition.findFirst({
            where: {
                orgId: organization.id,
                posId: position.id
            }
        })
        if (!orgPos) {
            orgPos = await prisma.posOrgComposition.create({
                data: {
                    orgId: organization.id,
                    posId: position.id
                }
            })
        }
        const posOrgRole = await prisma.posOrgRole.findFirst({
            where: {
                posOrgId: orgPos.id,
                roleId: role.id
            }
        })
        if (posOrgRole) {
            return c.json(makeResponse(9999, {
                message: '相同权限关系已存在'
            }))
        }
        const res = await prisma.posOrgRole.create({
            data: {
                posOrgId: orgPos.id,
                roleId: role.id
            }
        })
        return c.json(makeResponse())
    }
)


export default app