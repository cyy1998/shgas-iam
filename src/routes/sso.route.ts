import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createResponseSchema } from "../types/response.type";
import { success } from "../utils/response.utils";
import { config } from "../config";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { authService } from "../services/auth.service";
import { getProtocolAndHost } from "../utils/common.utils";

const app = new OpenAPIHono()


/*
path: /.well-known/authentication-configuration
method: GET
function: 单点登录元数据端点
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/.well-known/authentication-configuration',
        tags: ['SSO'],
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(z.object()),
                    },
                },
                description: '元数据信息',
            },
        }
    }),
    async (c) => {
        const origin = (new URL(c.req.url)).origin
        return c.json(success({
            authorizationEndpoint: `${origin}${config.AUTHORIZATION_ENDPOINT}`,
            logoutEndpoint: `${origin}${config.LOGOUT_ENDPOINT}`
        }))
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
        tags: ['SSO'],
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
            maxAge: config.REDIS_EXPIRE_TIME,
            path: '/',
        })
        if (data.orcasSessionId != null) {
            setCookie(c, `orcas_sso_sessionid`, data.orcasSessionId, {
                httpOnly: true,
                sameSite: 'Strict',  // 防 CSRF
                maxAge: config.REDIS_EXPIRE_TIME,
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
        tags: ['SSO'],
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
        const searchParams = new URLSearchParams(c.req.query())
        const sessionId = getCookie(c, 'global_session')
        const data = await authService.authorize(sessionId, client, redirectUrl)
        if (data.isLogin === false) {
            return c.redirect(`${config.LOGIN_PATH}?${searchParams.toString()}`)
        }
        return c.redirect(`${getProtocolAndHost(redirectUrl)}/sso/callback?code=${data.code}&client=${client}&redirectUrl=${encodeURIComponent(redirectUrl)}`)
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
        tags: ['SSO'],
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
        return c.redirect(redirectUrl ?? config.LOGIN_PATH)
    }
)

export default app