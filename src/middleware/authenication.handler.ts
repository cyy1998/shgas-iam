import type { Context, Next } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { CustomError } from "../errors/CustomError";
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError";
import { redis } from "../libs/cache/redis";
import type { UserDetailDto } from "../types/user.common.type";

export async function authenicationHandler(c: Context, next: Next) {
    console.log(c.req.header('X-Real-IP'))
    console.log(c.req.header('X-Forwarded-For'))
    const clientCode = c.req.header('Client')
    const sessionId = clientCode === 'iam' ? getCookie(c, `global_session`) ?? null
        : getCookie(c, `local_${clientCode}_session`) ?? null
    if (!clientCode) {
        throw new CustomError('非法请求')
    }
    // const path = c.req.header('X-Forwarded-Uri')
    // const userString = c.req.header('X-User-Info')
    if (!sessionId) {
        throw new AuthzUnauthorizedError('未登录')
    }
    // if (!userString) {
    //     throw new AuthzUnauthorizedError('未登录')
    // }
    const userString = clientCode === 'iam' ? await redis.get(`global_session:${sessionId}`)
        : await redis.get(`local_${clientCode}_session:${sessionId}`)
    if (!userString) {
        deleteCookie(c, clientCode === 'iam' ? `global_session:${sessionId}` : `local_${clientCode}_session:${sessionId}`)
        deleteCookie(c, 'orcas_sso_sessionid')
        throw new AuthzUnauthorizedError('未登录')
    }
    const userDto: UserDetailDto = JSON.parse(userString)
    // const userDto: UserDto = JSON.parse(Buffer.from(userString, 'base64').toString('utf8'))
    c.set('userId', userDto.id)
    c.set('username', userDto.username)
    c.set('userDetailDto', userDto)
    return await next()
}