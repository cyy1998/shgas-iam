import { prisma } from '../extensions'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { makeResponse, success } from '../utils/response.utils'
import { ResponseSchema, UserOutSchema } from '../schema'
import { createResponseSchema } from '../utils/response.utils'
import { employmentService } from '../services/employment.service'
import { roleService } from '../services/role.service'
import { privilegeService } from '../services/privilege.service'

const app = new OpenAPIHono()

/*
path: /position/set
function: 设置新岗位
*/
// app.openapi(
//     createRoute({
//         method: 'get',
//         path: '/users/filter/page',
//         tags: ['Admin'],
//         request: {
//             query: z.object({
//                 pageNum: z.number().openapi({ example: '123456' }),
//                 pageSize: z.number().openapi({ example: '123456' }),
//             })
//         },
//         responses: {
//             200: {
//                 content: {
//                     'application/json': {
//                         schema: createResponseSchema(z.object({
//                             pageNum: z.number(),
//                             pageSize: z.number(),
//                             total: z.number(),
//                             totalPages: z.number(),
//                             list: z.array(UserOutSchema),
//                         })),
//                     },
//                 },
//                 description: '设置岗位成功',
//             },
//         },
//     }),
//     async (c) => {
//         const { pageNum, pageSize } = c.req.valid('query')
//         const res =
//         return c.json(makeResponse())
//     }
// )

/*
path: /position/set
function: 设置新岗位
*/
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
    }
)
/*
path: /employment/set
function: 设置新权限
*/
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
                            username: z.string().openapi({ example: 'E01' }),
                            posCode: z.string().openapi({ example: 'SR01' }),
                            orgCode: z.string().openapi({ example: 'SR01' })
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
        const { username, posCode, orgCode } = c.req.valid('json')
        const data = await employmentService.setEmployment(username, posCode, orgCode)
        return c.json(success(data))
    }
)
/*
path: /privilege/set
function: 设置新权限
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/privilege/set',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            privCode: z.string().openapi({ example: 'E01' }),
                            privName: z.string().openapi({ example: 'SR01' }),
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
        const { privCode, privName } = c.req.valid('json')
        const data = await privilegeService.setPrivilege(privCode, privName)
        return c.json(success(data))
    }
)

/*
path: /role/set
function: 设置新角色
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/role/set',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            privCode: z.string().openapi({ example: 'E01' }),
                            privName: z.string().openapi({ example: 'SR01' }),
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
        const { privCode, privName } = c.req.valid('json')
        const data = await privilegeService.setPrivilege(privCode, privName)
        return c.json(success(data))
    }
)

/*
path: /role/employment/set
function: 为任职关系设置角色
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/role/employment/set',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            posCode: z.string().openapi({ example: 'E01' }),
                            orgCode: z.string().openapi({ example: 'SR01' }),
                            username: z.string().openapi({ example: '138550' }),
                            roleCode: z.string().openapi({ example: '138550' }),
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
                description: '角色设置成功',
            },
        },
    }),
    async (c) => {
        const { username, orgCode, posCode, roleCode } = c.req.valid('json')
        const data = await roleService.setRoleForEmployment(username, posCode, orgCode, roleCode)
        return c.json(success(data))
    }
)

/*
path: /role/pos-org/set
function: 为岗位-部门组合设置角色
*/
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