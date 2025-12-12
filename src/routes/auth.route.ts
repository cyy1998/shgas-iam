import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { getEvenLengthSubstrings, hmacSha256, makeResponse } from '../utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { createResponseSchema } from '../schema'
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
        const res = await authService.loginPassword(username, password)
        if (res.code === ServiceStatusCode.Success) {
            setCookie(c, 'orcas_sso_sessionid', res.data.orcasSessionId, {
                httpOnly: true,
                sameSite: 'Strict',  // 防 CSRF
                maxAge: env.REDIS_EXPIRE_TIME,
                path: '/',
            })
            setCookie(c, 'session', res.data.token, {
                httpOnly: true,
                sameSite: 'Strict',  // 防 CSRF
                maxAge: env.REDIS_EXPIRE_TIME,
                path: '/',
            })
        }
        return c.json(makeResponse(res.code, res.data, res.message))
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
        const res = await authService.loginOA(loginid, ts, token)
        if (res.code === ServiceStatusCode.Success) {
            setCookie(c, 'orcas_sso_sessionid', res.data.orcasSessionId, {
                httpOnly: true,
                sameSite: 'Strict',  // 防 CSRF
                maxAge: env.REDIS_EXPIRE_TIME,
                path: '/',
            })
            setCookie(c, 'session', res.data.token, {
                httpOnly: true,
                sameSite: 'Strict',  // 防 CSRF
                maxAge: env.REDIS_EXPIRE_TIME,
                path: '/',
            })
        }
        return c.json(makeResponse(res.code, res.data, res.message))
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
        const res = await authService.loginWX(code)
        setCookie(c, 'orcas_sso_sessionid', res.data.orcasSessionId, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        setCookie(c, 'session', res.data.token, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        return c.json(makeResponse(res.code, res.data, res.message))
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
        const res = await authService.logout(token)
        if (res.code === ServiceStatusCode.Success) {
            deleteCookie(c, 'session')
        }
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)
/*
path: /logout 
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
        if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(400, {}, '无效手机号'))
        }
        if (!await mobileService.checkExistingPhoneNumber(phoneNumber)) {
            return c.json(makeResponse(400, {}, '手机号不存在'))
        }
        const res = await mobileService.sendVerificationCode(phoneNumber)
        return c.json(makeResponse(res.code, res.data, res.message))
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
        const res = await authService.loginMobile(phoneNumber, code)
        if (res.code === ServiceStatusCode.Success) {
            setCookie(c, 'orcas_sso_sessionid', res.data.orcasSessionId, {
                httpOnly: true,
                sameSite: 'Strict',  // 防 CSRF
                maxAge: env.REDIS_EXPIRE_TIME,
                path: '/',
            })
            setCookie(c, 'session', res.data.token, {
                httpOnly: true,
                sameSite: 'Strict',  // 防 CSRF
                maxAge: env.REDIS_EXPIRE_TIME,
                path: '/',
            })
        }
        return c.json(makeResponse(res.code, res.data, res.message))
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
            // console.log(res)
            if (res.message === 'Maintenance') {
                c.header('Forbidden-Reason', 'maintenance')
            }
            else {
                c.header('Forbidden-Reason', 'Not Login')
            }
            return c.json(makeResponse(res.code, res.data, res.message), HttpStatusCode.Unauthorized)
        }
        c.header('X-User-Info', res.data)
        return c.json(makeResponse(res.code, res.data, res.message))
    }
)

export default app