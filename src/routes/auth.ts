import { Hono } from 'hono'

import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { getEvenLengthSubstrings, hmacSha256, makeResponse } from '../utils'
import { redis, prisma } from '../extensions'
import { getEmploymentDTO, getOrgDTO, getPrivDTO, getUserDTO, PrivDTO } from '../repositories/dto'
import { userService } from '../services/user.service'
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { createResponseSchema } from '../schema'
import { mobileService } from '../services/mobile.service'

const app = new OpenAPIHono()

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
        const { user, userDTO, sessionId, message, code } = await userService.createUserSession({
            username: username
        }, true, password)
        if (!user) {
            return c.json(makeResponse(401, {}, message), 401)
        }
        const { res, orcasSessionId } = await userService.orcasLogin(userDTO)
        if (res !== 'success') {
            return c.json(makeResponse(500, {}, 'orcas登录失败'), 500)
        }
        setCookie(c, 'session', sessionId, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'),        // 1小时（单位：秒）
            path: '/',
        })
        setCookie(c, 'orcas_sso_sessionid', orcasSessionId as string, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'),        // 1小时（单位：秒）
            path: '/',
        })
        return c.json(makeResponse(200, {}, 'Success'))
    })

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
        if (!token) {
            return c.json(makeResponse(401, {}, 'Unauthorized'), 401)
        }
        const result = await redis.del(`session:${token}`)
        deleteCookie(c, 'session')
        if (result === 1) {
            return c.json(makeResponse(200, {}, 'Success'))
        } else {
            return c.json(makeResponse(401, {}, 'Invalid Token'), 401)
        }
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
        const res: boolean = await mobileService.sendVerificationCode(phoneNumber)
        if (!res) {
            return c.json(makeResponse(9999, {}, '短信发送失败'))
        }
        return c.json(makeResponse(200, {}, 'success'))
    })

app.openapi(
    createRoute({
        method: 'post',
        path: '/mobile-login',
        tags: ['Auth'],
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
        const body = await c.req.json()
        const storageCode = await redis.get(`mobile-code:${body.phoneNumber}`)
        if (storageCode !== body.code) {
            return c.json(makeResponse(401, {}, '验证码错误'))
        }
        const { user, userDTO, sessionId, message, code } = await userService.createUserSession({
            mobilePhone: body.phoneNumber
        }, false)
        if (!user) {
            return c.json(makeResponse(401, {}, message))
        }
        const { res, orcasSessionId } = await userService.orcasLogin(userDTO)
        if (res !== 'success') {
            return c.json(makeResponse(500, {}, 'orcas登录失败'))
        }
        setCookie(c, 'session', sessionId, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'),        // 1小时（单位：秒）
            path: '/',
        })
        setCookie(c, 'orcas_sso_sessionid', orcasSessionId as string, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'),        // 1小时（单位：秒）
            path: '/',
        })

        return c.json(makeResponse(200, {}, 'success'))
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
        // const query_uri = c.req.header('X-Forwarded-Uri')
        // console.log(await c.req.json())
        const token = getCookie(c, 'session')
        if (!token) {
            return c.json(makeResponse(401, {}, 'Deny'), 401)
        }
        const userString = await redis.get(`session:${token}`)
        if (!userString) {
            return c.json(makeResponse(401, {}, 'Deny'), 401)
        }
        // const userDTO = JSON.parse(userString)
        // const apiPriv = userDTO.privileges.filter((p: PrivDTO) => p.objType === 'api')
        const user = Buffer.from(userString, 'utf8').toString('base64')
        c.header('X-User-Info', user)
        return c.json(makeResponse(200, {}, 'Allow'))
    })

export default app