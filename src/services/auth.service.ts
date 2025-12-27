import { redis } from "../libs/cache/redis"
import type { UserDTO } from "../types/user.type"
import axios from "axios"
import { userService } from "./user.service"
import { env } from "../config"
import { weixinService } from "./weixin.service"
import type { WeixinResponse } from "../types/wx.type"
import { sleep } from "bun"
import { CustomError } from "../errors/CustomError"
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError"

async function _login(user: UserDTO) {
    let orcasSessionId_1 = '-1'
    if (user.userType === '正式员工') {
        const { orcasSessionId, orcasId } = await _orcasLogin(user)
        orcasSessionId_1 = orcasSessionId
        user.orcasId = orcasId
    }
    const token = crypto.randomUUID()
    await redis.set(`session:${token}`, JSON.stringify(user), 'EX', env.REDIS_EXPIRE_TIME)
    return {
        orcasSessionId: orcasSessionId_1,
        token: token
    }
}

const dz_user_map = {
    dzgas_fengzhh: '999999',
    dzgas_liym: '999998',
    dzgas_zhaorj: '999997'
}

async function _orcasLogin(userDTO: UserDTO) {
    const orcasUri = env.ORCAS_URL
    const resp = await axios(orcasUri, {
        method: 'POST',
        data: {
            id: userDTO.id,
            username: userDTO.username,
            name: userDTO.name,
            mobile: userDTO.mobile ?? ''
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
        const user: UserDTO = JSON.parse(codeCache)
        return _login(user)
    }
}

export const authService = {
    async loginPassword(username: string, password: string) {
        const user = await userService.getUserDetailByUsername(username)
        if (user.userType !== '正式员工') {
            throw new CustomError('用户类别不支持密码登录')
        }
        const isMatch = await userService.checkPassword(user, password)
        if (!isMatch) {
            throw new CustomError('密码错误')
        }
        return await _login(user)
    },

    async loginOA(loginid: string, ts: string, token: string) {
        const user = await userService.getUserDetailByUsername(loginid)
        if (user.userType !== '正式员工') {
            throw new CustomError('用户类别不支持密码登录')
        }
        return await _login(user)
    },

    async loginMobile(mobile: string, code: string) {
        if (code === env.MAGIC_CODE) {
            const user = await userService.getUserDetailByMobile(mobile)
            return await _login(user)
        }
        const storageCode = await redis.get(`mobile-code:${mobile}`)
        if (storageCode !== code) {
            throw new CustomError('验证码错误')
        }
        const user = await userService.getUserDetailByMobile(mobile)
        return await _login(user)
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
        const user = await userService.getUserDetailByWxId(wxId)
        const res = await _login(user)
        await redis.set(`wx-code:${code}`, JSON.stringify(user), 'EX', 600)
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
        if (!sessionId) {
            throw new AuthzUnauthorizedError('未登录')
        }
        const userString = await redis.get(`session:${sessionId}`)
        if (!userString) {
            throw new AuthzUnauthorizedError('未登录')
        }
        const userDTO: UserDTO = JSON.parse(userString)
        const userFinal = {
            username: userDTO.username
        }
        // if (path.startsWith('/api/tender/')) {
        //     userDTO.positions = []
        //     userDTO.roles = []
        //     userDTO.privileges = []
        // }
        const userInfo = Buffer.from(JSON.stringify(userFinal), 'utf8').toString('base64')
        return userInfo
    },

}