import { z } from '@hono/zod-openapi'
import { ServiceStatusCode } from '../constants/service.status'

export function makeResponse(code: number = 200, data: unknown = null, message: string = 'success'): any {
    return {
        code: code,
        data: data,
        message: message
    }
}

export function success(data: unknown = null) {
    return makeResponse(ServiceStatusCode.Success, data, 'success')
}

export const createResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
    code: z.int().openapi({ example: 200 }),
    message: z.string().openapi({ example: 'success' }),
    data: dataSchema, // 这里是“抽象”的，由调用者决定具体结构
})

