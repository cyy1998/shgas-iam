import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { clientService } from '../services/client.service'
import { ClientDtoSchema, ClientVoSchema } from '../types/client.type'
import { success } from '../utils/response.utils'
import { createResponseSchema } from '../types/response.type'
import { userService } from '../services/user.common.service'
import { mobileService } from '../services/mobile.service'
import { VerificationCodeUsage } from '../constants/verificationCode.usage'

const app = new OpenAPIHono()

/*
path: /client/status
method: GET
function: 获取当前应用状态信息 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/client/status',
        tags: ['Open'],
        request: {
            query: z.object({
                clientCode: z.string()
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(ClientDtoSchema),
                    },
                },
                description: '应用信息',
            },
        },
    }),
    async (c) => {
        const { clientCode } = c.req.valid('query')
        const data = await clientService.getClientByCode(clientCode)
        return c.json(success(data))
    }
)

/*
path: /users/userinfo
method: GET
function: 获取用户当前信息 
*/
app.openapi(
    createRoute({
        method: 'get',
        path: '/users/userinfo',
        tags: ['Open'],
        request: {
            query: z.object({
                username: z.string()
            })
        },
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: createResponseSchema(ClientDtoSchema),
                    },
                },
                description: '应用信息',
            },
        },
    }),
    async (c) => {
        const { username } = c.req.valid('query')
        const data = await userService.getUserDetailByUsername(username)
        return c.json(success(data))
    }
)

/*
path: /sendMessage
method: POST
function: 发送登录验证码
*/
app.openapi(
    createRoute({
        method: 'post',
        path: '/sendMessage',
        tags: ['Open'],
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            phoneNumber: z.string().openapi({ example: '138550' }),
                            usage: z.enum(Object.values(VerificationCodeUsage)).openapi({ example: 'login' })
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
        const { phoneNumber, usage } = c.req.valid('json')
        const data = await mobileService.sendCode(phoneNumber, usage)
        return c.json(success(data))
    }
)

export default app