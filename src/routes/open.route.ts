import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { clientService } from '../services/client.service'
import { ClientVoSchema } from '../types/client.type'
import { createResponseSchema, success } from '../utils/response.utils'

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
                        schema: createResponseSchema(ClientVoSchema),
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

export default app