import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { success } from '../utils/response.utils'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { createResponseSchema } from '../types/response.type'
import { mobileService } from '../services/mobile.service'
import { authService } from '../services/auth.service'
import { env } from '../config'
import { redis } from 'bun'
import { AuthzUnauthorizedError } from '../errors/AuthzUnauthorizedError'
import type { UserDetailDto } from '../types/user.common.type'
import { getProtocolAndHost } from '../utils/common.utils'

const app = new OpenAPIHono()

/* 
path: /login
method: POST
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
            }
        },
    }),
    async (c) => {
        const { username, password } = c.req.valid('json')
        const data = await authService.loginPassword(username, password)
        // if (data.orcasSessionId !== null) {
        //     setCookie(c, 'orcas_sso_sessionid', data.orcasSessionId, {
        //         httpOnly: true,
        //         sameSite: 'Strict',  // 防 CSRF
        //         maxAge: env.REDIS_EXPIRE_TIME,
        //         path: '/',
        //     })
        // }
        setCookie(c, 'global_session', data.token, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        return c.json(success({ code: data.code }))
    }
)

/* 
path: /login/oa
method: POST
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
        // if (data.orcasSessionId !== null) {
        //     setCookie(c, 'orcas_sso_sessionid', data.orcasSessionId, {
        //         httpOnly: true,
        //         sameSite: 'Strict',  // 防 CSRF
        //         maxAge: env.REDIS_EXPIRE_TIME,
        //         path: '/',
        //     })
        // }
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
path: /mobile-login 
method: POST
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
        }
    }),
    async (c) => {
        const { code, phoneNumber } = c.req.valid('json')
        const data = await authService.loginMobile(phoneNumber, code)
        setCookie(c, 'global_session', data.token, {
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
method: POST
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
path: /callback
method: GET
function: 本地session建立
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/callback',
        tags: ['Auth'],
        request: {
            query: z.object({
                code: z.string().openapi({ example: 'dw98qr3hoi2hn' }),
                client: z.string().openapi({ example: 'tender' }),
                redirectUrl: z.url().openapi({ example: 'http://localhost:8080' })
            }),
        },
        responses: {
            301: {
                description: '本地会话回调成功',
            }
        },
    }),
    async (c) => {
        const { code, client, redirectUrl } = c.req.valid('query')
        const data = await authService.setLocalSession(code, client, redirectUrl)
        setCookie(c, `local_${client}_session`, data.token, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: env.REDIS_EXPIRE_TIME,
            path: '/',
        })
        if (data.orcasSessionId != null) {
            setCookie(c, `orcas_sso_sessionid`, data.orcasSessionId, {
                httpOnly: true,
                sameSite: 'Strict',  // 防 CSRF
                maxAge: env.REDIS_EXPIRE_TIME,
                path: '/',
            })
        }
        // const data = await authService.loginPassword(username, password)
        // if (data.orcasSessionId !== null) {
        //     setCookie(c, 'orcas_sso_sessionid', data.orcasSessionId, {
        //         httpOnly: true,
        //         sameSite: 'Strict',  // 防 CSRF
        //         maxAge: env.REDIS_EXPIRE_TIME,
        //         path: '/',
        //     })
        // }
        // setCookie(c, 'session', data.token, {
        //     httpOnly: true,
        //     sameSite: 'Strict',  // 防 CSRF
        //     maxAge: env.REDIS_EXPIRE_TIME,
        //     path: '/',
        // })
        return c.redirect(redirectUrl)
    }
)

/* 
path: /authorize
method: GET
function: 本地session建立
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/authorize',
        tags: ['Auth'],
        request: {
            query: z.object({
                client: z.string().openapi({ example: 'tender' }),
                redirectUrl: z.url().openapi({ example: 'http://localhost:8080' }),
            }),
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: 'session设置成功',
            },
            301: {
                description: '全局未登录，跳转登录页面',
            }
        },
    }),
    async (c) => {
        const { client, redirectUrl } = c.req.valid('query')
        const sessionId = getCookie(c, 'global_session')
        const data = await authService.authorize(sessionId, client, redirectUrl)
        if (data.isLogin === false) {
            return c.redirect(`${env.LOGIN_PATH}?client=${client}&redriect_url=${encodeURIComponent(redirectUrl)}`)
        }
        return c.redirect(`${getProtocolAndHost(redirectUrl)}/api/iam/auth/callback?code=${data.code}&client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`)
    }
)

/*
path: /logout 
method: GET
function: logout
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/logout',
        tags: ['Auth'],
        request: {
            query: z.object({
                redirectUrl: z.url().openapi({ example: 'http://localhost:8080' })
            })
        },
        responses: {
            302: {
                description: '登出成功',
            }
        },
    }),
    async (c) => {
        const { redirectUrl } = c.req.valid('query')
        const token = getCookie(c, 'global_session') ?? null
        await authService.logout(token)
        deleteCookie(c, 'global_session')
        return c.redirect(redirectUrl ?? env.LOGIN_PATH)
    }
)

/*
path: /send-message
method: POST
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
path: /authz 
method: GET
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
            }
        }
    }),
    async (c) => {
        const clientCode = c.req.header('Client') ?? null
        const sessionId = getCookie(c, `local_${clientCode}_session`) ?? null
        const data = await authService.authz(sessionId, clientCode, c.req.header('X-Forwarded-Uri'))
        c.header('X-User-Info', data)
        return c.json(success(data))
    }
)

export default app