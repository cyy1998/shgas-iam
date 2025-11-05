import { Hono } from 'hono'
import { OrganizationQuery, UserDTO, getOrgDTO, getUserDTO } from '../dto'
import { User } from '../generated/prisma'
import { redis, prisma } from '../extensions'
import { makeResponse } from '../utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { ResponseSchema, createResponseSchema, OrganizationInputSchema, UserOutSchema } from '../schema'

const app = new OpenAPIHono()

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
        const users = await prisma.user.findMany({
            where: {
                employments: {
                    some: {
                        deptartment: {
                            orgCode: {
                                startsWith: orgCode
                            }
                        }
                    }
                },
                NOT: {
                    username: user.username
                }
            },

        })
        return c.json(makeResponse(200, users.map(u => getUserDTO(u))))
    }
)

app.openapi(
    createRoute({
        method: 'get',
        path: '/organizations',
        tags: ['Self'],
        request: {
            query: z.object({
                orgLevel: z.coerce.number().int().openapi({ example: "2" }),
                comCode: z.string().optional().openapi({ example: "SR" })
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
        const user: UserDTO = JSON.parse(Buffer.from(c.req.header('X-User-Info') ?? '', 'base64').toString('utf8'))
        const { orgLevel, comCode } = c.req.valid('query')
        const orgCodes = user.positions?.map(p => p.orgCode.substring(0, orgLevel * 2))
        const organizations = await prisma.organization.findMany({
            where: {
                orgCode: {
                    in: orgCodes,
                    startsWith: comCode
                },
                level: orgLevel
            }
        })
        return c.json(makeResponse(200, organizations.map(o => getOrgDTO(o))))
    }
)

export default app
