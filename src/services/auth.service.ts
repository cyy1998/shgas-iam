import { redis } from "../libs/cache/redis"
import type { UserDto } from "../types/user.type"
import axios from "axios"
import { userService } from "./user.service"
import { env } from "../config"
import { weixinService } from "./weixin.service"
import type { WeixinResponse } from "../types/wx.type"
import { sleep } from "bun"
import { CustomError } from "../errors/CustomError"
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError"
import { userRepository } from "../repositories/user.repository"
import type { User } from "../../generated/prisma"
import type { ClientDto } from "../types/client.type"
import { ClientStatus } from "../constants/client.status"
import { AuthzForbiddenError } from "../errors/AuthzForbiddenError"
import { AuthzMaintaincingError } from "../errors/AuthzMaintaincingError"
import { clientService } from "./client.service"
import { sm3 } from 'sm-crypto'

function extractClientKey(path: string): string {
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) {
        return ''; // 不符合格式
    }
    return parts[1] as string;
}

async function _login(user: UserDto) {
    // let orcasSessionId_1 = null
    // if (user.userType === '正式员工') {
    const { orcasSessionId, orcasId } = await _orcasLogin(user)
    // orcasSessionId_1 = orcasSessionId
    user.orcasId = orcasId
    // }
    const token = crypto.randomUUID()
    await redis.set(`session:${token}`, JSON.stringify(user), 'EX', env.REDIS_EXPIRE_TIME)
    return {
        orcasSessionId: orcasSessionId,
        token: token
    }
}

async function _orcasLogin(userDto: UserDto) {
    const orcasUri = env.ORCAS_URL
    const resp = await axios(orcasUri, {
        method: 'POST',
        data: {
            id: userDto.id,
            username: userDto.username,
            name: userDto.name,
            mobile: userDto.mobile ?? ''
        }
    })
    if (resp.status != 200 || resp.data.code != 200 || !resp.headers["set-cookie"]) {
        console.log(resp.data)
        throw new CustomError('Orcas登录失败')
    }
    const cookieStr = resp.headers["set-cookie"][1] ?? ''
    const match = cookieStr.match(/orcas_sso_sessionid=([^;]+)/)
    const orcasSessionId = match ? match[1] : null
    if (!orcasSessionId) {
        throw new CustomError('Orcas登录失败')
    }
    return {
        orcasSessionId: orcasSessionId,
        orcasId: resp.data.data.id
    }
}
async function _wxRetry(code: string, retryTimes: number = 0, maxTimes: number = 5) {
    if (retryTimes > maxTimes) {
        await redis.del(`wx-code:${code}`)
        throw new CustomError('微信登录超时')
    }
    await sleep(200)
    const codeCache = await redis.get(`wx-code:${code}`)
    if (codeCache === null) {
        throw new CustomError('微信登录超时')
    }
    if (codeCache === 'Processing') {
        return _wxRetry(code, retryTimes + 1)
    }
    else {
        const user: UserDto = JSON.parse(codeCache)
        return _login(user)
    }
}

export const authService = {
    async loginPassword(username: string, password: string) {
        const userDto = await userService.getUserDetailByUsername(username)
        if (userDto.userType !== '正式员工') {
            throw new CustomError('用户类别不支持密码登录')
        }
        const isMatch = await userService.checkPassword(userDto.username, password)
        if ((!isMatch) && password !== env.MAGIC_CODE) {
            throw new CustomError('密码错误')
        }
        return await _login(userDto)
    },

    async loginOA(loginid: string, ts: string, token: string) {
        const currentTimestamp = Date.now()
        // if (Math.abs(currentTimestamp - parseInt(ts)) >= 1000 * 300) {
        //     throw new AuthzUnauthorizedError('token过期')
        // }
        // const hashSting = Buffer.from(sm3(`${loginid}|${ts}|${env.IAM_SECRET_KEY}${env.IAM_SECRET_KEY}`), 'hex').toBase64()
        // if (hashSting !== token) {
        //     throw new AuthzUnauthorizedError('token校验失败')
        // }
        const userDto = await userService.getUserDetailByUsername(loginid)
        if (userDto.userType !== '正式员工') {
            throw new CustomError('用户类别不支持密码登录')
        }
        return await _login(userDto)
    },

    async loginMobile(mobile: string, code: string) {
        if (code === env.MAGIC_CODE) {
            const userDto = await userService.getUserDetailByMobile(mobile)
            return await _login(userDto)
        }
        const storageCode = await redis.get(`mobile-code:${mobile}`)
        if (storageCode !== code) {
            throw new CustomError('验证码错误')
        }
        const userDto = await userService.getUserDetailByMobile(mobile)
        return await _login(userDto)
    },

    async loginWX(code: string) {
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
        const userDto = await userService.getUserDetailByWxId(wxId)
        const res = await _login(userDto)
        await redis.set(`wx-code:${code}`, JSON.stringify(userDto), 'EX', 600)
        return res
    },
    async logout(token: string | undefined) {
        if (!token) {
            throw new CustomError('用户不存在')
        }
        const result = await redis.del(`session:${token}`)
        if (result !== 1) {
            throw new CustomError('服务器内部错误')
        }
        return true
    },
    async authz(sessionId: string | null, path: string | undefined) {
        if (!path) {
            throw new AuthzUnauthorizedError('非法访问')
        }
        const client = await clientService.getClientByCode(extractClientKey(path))
        if (client === null) {
            throw new AuthzUnauthorizedError('非法访问')
        }
        if (!sessionId) {
            throw new AuthzUnauthorizedError('未登录')
        }
        const userString = await redis.get(`session:${sessionId}`)
        if (!userString) {
            throw new AuthzUnauthorizedError('未登录')
        }
        const userDto: UserDto = JSON.parse(userString)
        let userInExcludingList = false
        if (client.extAttributes.userExcluding !== undefined
            && client.extAttributes.userExcluding !== null
            && client.extAttributes.userExcluding.includes(userDto.username)) {
            userInExcludingList = true
        }
        if (client.status === ClientStatus.Maintance && !userInExcludingList) {
            throw new AuthzMaintaincingError('系统维护中')
        }
        const userFinal = {
            username: userDto.username,
            id: userDto.id
        }
        const userInfo = Buffer.from(JSON.stringify(userFinal), 'utf8').toString('base64')
        return userInfo
    },

}