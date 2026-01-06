import { prisma } from '../libs/database/prisma'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { createResponseSchema, makeResponse, success } from '../utils/response.utils'
import { employmentService } from '../services/employment.service'
import { roleService } from '../services/role.service'
import { privilegeService } from '../services/privilege.service'
import { ResponseSchema } from '../types/response.type'
import { ClientDtoSchema, ClientInputDtoSchema } from '../types/client.type'
import { clientService } from '../services/client.service'

const app = new OpenAPIHono()
/*
path: /client/update
function: 应用更新
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/client/update',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: ClientInputDtoSchema
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
                description: '设置岗位成功',
            },
        },
    }),
    async (c) => {
        const body = c.req.valid('json')
        const data = await clientService.updateClient(body)
        return c.json(success(data))
    }
)
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
                            roleCode: z.string().openapi({ example: 'E01' }),
                            roleName: z.string().openapi({ example: 'SR01' }),
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
        const { roleCode, roleName } = c.req.valid('json')
        const data = await roleService.setRole(roleCode, roleName)
        return c.json(success(data))
    }
)

/*
path: /role/privilege/set
function: 设置角色权限关系
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/role/privilege/set',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            roleCode: z.string().openapi({ example: 'E01' }),
                            privCode: z.string().openapi({ example: 'E01' }),
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
        const { roleCode, privCode } = c.req.valid('json')
        const data = await roleService.setRolePrivilege(roleCode, privCode)
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
path: /role/organization/set
function: 为任职关系设置角色
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/role/organization/set',
        tags: ['Admin'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            roleCode: z.string().openapi({ example: 'E01' }),
                            orgCode: z.string().openapi({ example: 'SR01' }),
                            isAllSub: z.boolean()
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
        const { orgCode, roleCode, isAllSub } = c.req.valid('json')
        const data = await roleService.setRoleForOrganization(orgCode, roleCode)
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
        const data = await roleService.setRoleForPosOrg(orgCode, posCode, roleCode)
        return c.json(success(data))
    }
)

/*
path: /role/pos-org/delete
function: 为岗位-部门组合删除角色
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/role/pos-org/delete',
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
                description: '删除角色成功',
            },
        },
    }),
    async (c) => {
        const { roleCode, orgCode, posCode } = c.req.valid('json')
        const data = await roleService.deleteRoleForPosOrg(orgCode, posCode, roleCode)
        return c.json(success(data))
    }
)

/*
path: /role/employment/delete
function: 为任职关系设置角色
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/role/employment/delete',
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
        const data = await roleService.deleteRoleForEmployment(username, posCode, orgCode, roleCode)
        return c.json(success(data))
    }
)


export default app