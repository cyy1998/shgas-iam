import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { getEvenLengthSubstrings, hmacSha256, makeResponse } from '../utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { createResponseSchema } from '../schema'
import { mobileService } from '../services/mobile.service'
import { authService } from '../services/auth.service'
import { HttpStatusCode, ServiceStatusCode } from '../constant'

const app = new OpenAPIHono()

/* 
function: login by password
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/login',
        tags: ['Auth'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            username: z.string().openapi({ example: '138550' }),
                            password: z.string().openapi({ example: '1234' })
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
                description: '设置岗位成功',
            },
            401: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '认证失败',
            },
            500: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '内部错误',
            },
        },
    }),
    async (c) => {
        const { username, password } = c.req.valid('json')
        const res = await authService.loginByPassword(username, password, c)
        return c.json(makeResponse(res.code, res.data, res.message))
    })

/* 
function: logout
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/logout',
        tags: ['Auth'],
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '登出成功',
            },
            401: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '认证失败',
            }
        },
    }),
    async (c) => {
        const res = await authService.logout(c)
        return c.json(makeResponse(res.code, res.data, res.message))
    })

app.openapi(
    createRoute({
        method: 'post',
        path: '/send-message',
        tags: ['Auth'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            phoneNumber: z.string().openapi({ example: '138550' }),
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
        if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(400, {}, '无效手机号'))
        }
        if (!await mobileService.checkExistingPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(400, {}, '手机号不存在'))
        }
        const res = await mobileService.sendVerificationCode(phoneNumber)
        return c.json(makeResponse(res.code, res.data, res.message))
    })

app.openapi(
    createRoute({
        method: 'post',
        path: '/mobile-login',
        tags: ['Auth'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            phoneNumber: z.string().openapi({ example: '17721462865' }),
                            code: z.string().openapi({ example: '1234' })
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
            },
            401: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '认证失败',
            },
            500: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '内部错误',
            },
        }
    }),
    async (c) => {
        const { code, phoneNumber } = c.req.valid('json')
        const res = await authService.loginByMobile(phoneNumber, code, c)
        return c.json(makeResponse(res.code, res.data, res.message))
    })

app.openapi(
    createRoute({
        method: 'get',
        path: '/authz',
        tags: ['Auth'],
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: 'Allow',
            },
            401: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: 'Deny',
            }
        }
    }),
    async (c) => {
        const sessionId = getCookie(c, 'session') ?? null
        const res = await authService.authz(sessionId)
        if (res.code == ServiceStatusCode.Forbidden) {
            return c.json(makeResponse(res.code, res.data, res.message), HttpStatusCode.Unauthorized)
        }
        c.header('X-User-Info', res.data)
        return c.json(makeResponse(res.code, res.data, res.message))
    })

export default app