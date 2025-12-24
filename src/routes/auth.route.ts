import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { makeResponse, success } from '../utils/response.utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { createResponseSchema } from '../utils/response.utils'
import { mobileService } from '../services/mobile.service'
import { authService } from '../services/auth.service'
import { ServiceStatusCode } from "../constants/service.status"
import { HttpStatusCode } from "../constants/http.status"
import { env } from '../config'

const app = new OpenAPIHono()

/* 
path: /login
function: 密码登录
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
        const data = await authService.loginPassword(username, password)
        setCookie(c, 'orcas_sso_sessionid', data.orcasSessionId, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        setCookie(c, 'session', data.token, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        return c.json(success(data))
    }
)
/* 
path: /login/oa
function: oa登录
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/login/oa',
        tags: ['Auth'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            loginid: z.string().openapi({ example: '138550' }),
                            ts: z.string().openapi({ example: '1234' }),
                            token: z.string().openapi({ example: '138550' })
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
        const { loginid, ts, token } = c.req.valid('json')
        const data = await authService.loginOA(loginid, ts, token)
        setCookie(c, 'orcas_sso_sessionid', data.orcasSessionId, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        setCookie(c, 'session', data.token, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        return c.json(success(data))
    }
)
/* 
path: /login/wx
function: 微信登录
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/login/wx',
        tags: ['Auth'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
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
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '认证',
            },
            401: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '认证失败',
            },
        },
    }),
    async (c) => {
        const { code } = c.req.valid('json')
        const data = await authService.loginWX(code)
        setCookie(c, 'orcas_sso_sessionid', data.orcasSessionId, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        setCookie(c, 'session', data.token, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        return c.json(success(data))
    }
)
/*
path: /logout 
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
        const token = getCookie(c, 'session')
        const data = await authService.logout(token)
        deleteCookie(c, 'session')
        return c.json(success(data))
    }
)
/*
path: /send-message
function: 发送登录验证码
*/
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
        const data = await mobileService.sendCodeWithExistingPhone(phoneNumber)
        return c.json(success(data))
    }
)
/*
path: /mobile-login 
function: 手机登录
*/
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
        const data = await authService.loginMobile(phoneNumber, code)
        setCookie(c, 'orcas_sso_sessionid', data.orcasSessionId, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        setCookie(c, 'session', data.token, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        return c.json(success(data))
    }
)
/*
path: /authz 
function: 接口鉴权
*/
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
            400: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: 'Bad Request',
            },
            500: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: 'Server Error',
            },
            401: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: 'Unauthorized',
            },
            403: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: 'Forbidden',
            }
        }
    }),
    async (c) => {
        const sessionId = getCookie(c, 'session') ?? null
        const data = await authService.authz(sessionId)
        c.header('X-User-Info', data)
        return c.json(success(data))
    }
)

export default app