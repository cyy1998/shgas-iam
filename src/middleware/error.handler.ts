import type { HTTPResponseError } from "hono/types"
import { AuthzError } from "@errors/AuthzError"
import { CustomError } from "@errors/CustomError"
import { makeResponse } from "../utils/response.utils"
import type { Context } from "hono"
import { ServiceStatusCode } from "@constants/service.status"

export function errorHandler(err: Error | HTTPResponseError, c: Context) {
    if (err instanceof CustomError) {
        return c.json(makeResponse(err.code, null, err.message))
    }
    else if (err instanceof AuthzError) {
        return c.json(makeResponse(err.code, null, err.message), err.httpCode)
    }
    else {
        console.error(err)
        return c.json(makeResponse(ServiceStatusCode.Failure, null, '服务器内部错误'))
    }
}