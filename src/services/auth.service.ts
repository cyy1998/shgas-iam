import { ServiceStatusCode } from "../constants/service.status"
import { userRepository } from "../repositories/user.repository"
import type { ServiceResult } from "../types/service.type"
import { employmentRepository } from "../repositories/employment.repository"
import { privilegeRepository } from "../repositories/privilege.repository"
import { privilegeMapper } from "../mapper/privilege.mapper"
import { userMapper } from "../mapper/user.mapper"
import { employmentMapper } from "../mapper/employment.mapper"
import { redis } from "../extensions"
import type { UserDTO } from "../types/user.type"
import axios from "axios"
import type { User } from "../../generated/prisma"
import { userService } from "./user.service"
import { getTimestampDifference, hmacSha256 } from "../utils"
import { env } from "../config"
import { weixinService } from "./weixin.service"
import type { WeixinResponse } from "../types/wx.type"
import { sleep } from "bun"
import { HttpStatusCode } from "../constants/http.status"

async function _login(user: UserDTO): Promise<ServiceResult> {
    const { code, orcasSessionId, orcasId } = await _orcasLogin(user)
    if (code !== ServiceStatusCode.Success) {
        return {
            code: ServiceStatusCode.Failure,
            data: {},
            message: 'Orcas登录失败'
        }
    }
    user.orcasId = orcasId
    const token = crypto.randomUUID()
    await redis.set(`session:${token}`, JSON.stringify(user), 'EX', env.REDIS_EXPIRE_TIME)
    return {
        code: ServiceStatusCode.Success,
        data: {
            orcasSessionId: orcasSessionId,
            token: token
        },
        message: 'success'
    }
}
async function _orcasLogin(userDTO: UserDTO) {
    const orcasUri = env.ORCAS_URL
    // console.log(orcasUri)
    const resp = await axios(orcasUri, {
        method: 'POST',
        data: {
            id: userDTO.id,
            username: userDTO.username,
            name: userDTO.name,
            mobile: userDTO.mobile ?? ''
        }
    })
    // console.log(resp)
    if (resp.status != 200 || resp.data.code != 200 || !resp.headers["set-cookie"]) {
        return {
            code: ServiceStatusCode.Failure
        }
    }
    const cookieStr = resp.headers["set-cookie"][1] ?? ''
    const match = cookieStr.match(/orcas_sso_sessionid=([^;]+)/)
    const orcasSessionId = match ? match[1] : ''
    return {
        code: ServiceStatusCode.Success,
        orcasSessionId: orcasSessionId,
        orcasId: resp.data.data.id
    }
}
async function _wxRetry(code: string, retryTimes: number = 0, maxTimes: number = 5) {
    if (retryTimes > maxTimes) {
        await redis.del(`wx-code:${code}`)
        throw Error('微信登录超时')
    }
    await sleep(200)
    const codeCache = await redis.get(`wx-code:${code}`)
    if (codeCache === null) {
        throw Error('微信登录失败')
    }
    if (codeCache === 'Processing') {
        return _wxRetry(code, retryTimes + 1)
    }
    else {
        const user: UserDTO = JSON.parse(codeCache)
        return _login(user)
    }
}

export const authService = {
    async loginPassword(username: string, password: string): Promise<ServiceResult> {
        const userRes = await userService.getUserDetailByUsername(username)
        if (userRes.data === null) {
            return {
                code: ServiceStatusCode.UserNotExisting,
                data: {},
                message: '用户不存在'
            }
        }
        const user = userRes.data
        if (user.userType !== '正式员工') {
            return {
                code: ServiceStatusCode.UserNotExisting,
                data: {},
                message: '用户类别不支持密码登录'
            }
        }
        const isMatch = await userService.checkPassword(user, password)
        if (!isMatch) {
            return {
                code: ServiceStatusCode.WrongPassword,
                data: {},
                message: '密码错误'
            }
        }
        return await _login(user)
    },
    async loginOA(loginid: string, ts: string, token: string): Promise<ServiceResult> {
        const userRes = await userService.getUserDetailByUsername(loginid)
        if (userRes.data === null) {
            return {
                code: ServiceStatusCode.UserNotExisting,
                data: {},
                message: '用户不存在'
            }
        }
        return await _login(userRes.data)
    },
    async loginMobile(mobile: string, code: string): Promise<ServiceResult> {
        if (code === env.MAGIC_CODE) {
            const userRes = await userService.getUserDetailByMobile(mobile)
            if (userRes.data === null) {
                return {
                    code: ServiceStatusCode.UserNotExisting,
                    data: {},
                    message: '用户不存在'
                }
            }
            return await _login(userRes.data)
        }
        const storageCode = await redis.get(`mobile-code:${mobile}`)
        if (storageCode !== code) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '验证码错误'
            }
        }
        const userRes = await userService.getUserDetailByMobile(mobile)
        if (userRes.data === null) {
            return {
                code: ServiceStatusCode.UserNotExisting,
                data: {},
                message: '用户不存在'
            }
        }
        return await _login(userRes.data)
    },
    async loginWX(code: string): Promise<ServiceResult> {
        const codeCache = await redis.get(`wx-code:${code}`)
        if (codeCache !== null) {
            return _wxRetry(code)
        }
        await redis.set(`wx-code:${code}`, 'Processing', 'EX', 600)
        const accessToken = await weixinService.getWxAccessToken()
        if (!accessToken) {
            redis.del(`wx-code:${code}`)
            throw new Error('网络错误，AccessToken获取失败')
        }
        const resp = await fetch(
            `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${code}`,
            {
                method: 'POST'
            }
        )
        const body = await resp.json() as WeixinResponse
        const wxId = body.userid
        const userRes = await userService.getUserDetailByWxId(wxId)
        if (userRes.data === null) {
            return {
                code: ServiceStatusCode.UserNotExisting,
                data: {},
                message: '用户不存在'
            }
        }
        const res = await _login(userRes.data)
        await redis.set(`wx-code:${code}`, JSON.stringify(userRes.data), 'EX', 600)
        return res
    },
    async logout(token: string | undefined): Promise<ServiceResult> {
        if (!token) {
            return {
                code: ServiceStatusCode.Unauthorized,
                data: {},
                message: '用户不存在'
            }
        }
        const result = await redis.del(`session:${token}`)
        if (result !== 1) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '服务器内部错误'
            }
        }
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }

    },
    async authz(sessionId: string | null): Promise<ServiceResult> {
        if (!sessionId) {
            return {
                code: ServiceStatusCode.Unauthorized,
                httpCode: HttpStatusCode.Unauthorized,
                data: {},
                message: 'Unauthorized'
            }
        }
        const userString = await redis.get(`session:${sessionId}`)
        if (!userString) {
            return {
                code: ServiceStatusCode.Unauthorized,
                httpCode: HttpStatusCode.Unauthorized,
                data: {},
                message: 'Unauthorized'
            }
        }
        const userInfo = Buffer.from(userString, 'utf8').toString('base64')
        return {
            code: ServiceStatusCode.Success,
            data: userInfo,
            message: 'Allow'
        }
    },
    async updateSession(sessionId: string, userDTO: UserDTO): Promise<ServiceResult> {
        await redis.set(`session:${sessionId}`, JSON.stringify(userDTO), 'EX', env.REDIS_EXPIRE_TIME)
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }
    },
}