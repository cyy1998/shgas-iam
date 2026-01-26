import { redis } from "../libs/cache/redis"
import type { UserDetailDto, UserDto } from "../types/user.common.type"
import axios from "axios"
import { userService } from "./user.common.service"
import { env } from "../config"
import { weixinService } from "./weixin.service"
import type { WeixinResponse } from "../types/wx.type"
import { sleep } from "bun"
import { CustomError } from "../errors/CustomError"
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError"
import { ClientStatus } from "../constants/client.status"
import { AuthzMaintaincingError } from "../errors/AuthzMaintaincingError"
import { clientService } from "./client.service"
import { sm3 } from 'sm-crypto'
import { sessionService } from "./session.service"
import type { AuthObject } from "../types/authObject.type"

async function _login(user: UserDetailDto) {
    const sessionId = crypto.randomUUID()
    const code = crypto.randomUUID()
    // const existingGlobalSessionId = await redis.get(`${user.username}_global_session`)
    // if (existingGlobalSessionId !== null) {
    //     const existingGlobalSession = await redis.get(`global_session:${existingGlobalSessionId}`)
    //     if (existingGlobalSession !== null) {
    //         await redis.set(`auth_code:${code}`, existingGlobalSession, 'EX', 180)
    //         return {
    //             token: existingGlobalSessionId,
    //             code: code
    //         }
    //     }
    // }
    await Promise.all([
        redis.set(`global_session:${sessionId}`, JSON.stringify(user), 'EX', env.REDIS_EXPIRE_TIME),
        redis.set(`auth_code:${code}`, JSON.stringify({
            sessionId: sessionId,
            data: JSON.stringify(user)
        }), 'EX', env.AUTH_CODE_EXPIRE_TIME),
        // redis.set(`global_session_for_code:${code}`, sessionId, 'EX', env.AUTH_CODE_EXPIRE_TIME)
        // redis.set(`${user.username}_global_session`, token, 'EX', env.REDIS_EXPIRE_TIME)
    ])
    return {
        token: sessionId,
        code: code
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
        const user: UserDetailDto = JSON.parse(codeCache)
        return _login(user)
    }
}

export const authService = {
    async loginPassword(username: string, password: string) {
        const userDto = await userService.getUserDetailByUsername(username)
        const isMatch = await userService.checkPassword(userDto.username, password)
        if ((!isMatch) && password !== env.MAGIC_CODE) {
            throw new CustomError('密码错误')
        }
        return await _login(userDto)
    },

    async loginOA(loginid: string, ts: string, token: string) {
        const currentTimestamp = Date.now()
        if (env.NODE_ENV === 'production' && Math.abs(currentTimestamp - parseInt(ts)) >= 1000 * 300) {
            throw new AuthzUnauthorizedError('token过期')
        }
        const hashSting = Buffer.from(sm3(`${loginid}|${ts}|${env.IAM_SECRET_KEY}${env.IAM_SECRET_KEY}`), 'hex').toBase64()
        if (hashSting !== token) {
            throw new AuthzUnauthorizedError('token校验失败')
        }
        const userDto = await userService.getUserDetailByUsername(loginid)
        if (userDto.userType !== '正式员工') {
            throw new CustomError('用户类别不支持OA登录')
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

    async logout(globalSessionId: string | null) {
        const existSession = await redis.exists(`global_session:${globalSessionId}`)
        if (existSession === 0) {
            throw new CustomError('会话不存在')
        }
        // const user: UserDetailDto = JSON.parse(userString)
        // const localSessionSet = await redis.lrange(`local_session_set:${sessionId}`, 0, -1)
        const localSessionSet = await sessionService.getValidLocalSessions(`local_session_set:${globalSessionId}`)
        await Promise.all(localSessionSet.map(s => redis.del(s)))
        await Promise.all([
            redis.del(`global_session:${globalSessionId}`),
            redis.del(`local_session_set:${globalSessionId}`)
        ])
        // if (result !== 1) {
        //     throw new CustomError('服务器内部错误')
        // }
        return true
    },

    async authz(sessionId: string | null, clientCode: string | null, path: string | undefined) {
        if (!path || !clientCode) {
            throw new AuthzUnauthorizedError('非法访问')
        }
        const client = await clientService.getClientByCode(clientCode)
        if (client === null) {
            throw new AuthzUnauthorizedError('非法访问')
        }
        if (!sessionId) {
            throw new AuthzUnauthorizedError('未登录')
        }
        const userString = await redis.get(`local_${clientCode}_session:${sessionId}`)
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

    async setLocalSession(code: string, clientCode: string, redirectUrl: string) {
        const client = await clientService.getClientByCode(clientCode)
        if (client === null) {
            throw new CustomError('非法client代码')
        }
        if (!client.extAttributes.validRedirectUrls.some(u => redirectUrl.startsWith(u))) {
            throw new CustomError('非法重定向地址')
        }
        const authObjectString = await redis.get(`auth_code:${code}`)
        if (authObjectString === null) {
            throw new AuthzUnauthorizedError('非法code')
        }
        const authObject: AuthObject = JSON.parse(authObjectString)
        console.log(authObject)
        const userString = authObject.data
        const globalSessionId = authObject.sessionId

        const user: UserDetailDto = JSON.parse(userString)

        // const globalSessionId = await redis.get(`global_session_for_code:${code}`)
        if (!globalSessionId) {
            throw new AuthzUnauthorizedError('全局session不存在')
        }
        const ttl = await redis.ttl(`global_session:${globalSessionId}`)
        const localSessionId = crypto.randomUUID()
        let globalOrcasSessionId = null
        if (client.extAttributes.requireOrcas === true) {
            const { orcasSessionId, orcasId } = await _orcasLogin(user)
            globalOrcasSessionId = orcasSessionId
            user.orcasId = orcasId
        }
        await Promise.all([
            redis.set(`local_${clientCode}_session:${localSessionId}`, JSON.stringify(user), 'EX', ttl),
            redis.del(`auth_code:${code}`),
            sessionService.setLocalSession(`local_session_set:${globalSessionId}`, `local_${clientCode}_session:${localSessionId}`, ttl)
            // redis.lpush(`local_session_set:${globalSessionId}`, `local_${clientCode}_session:${localSessionId}`)
        ])

        await redis.expire(`local_session_set:${globalSessionId}`, env.REDIS_EXPIRE_TIME)
        return {
            orcasSessionId: globalOrcasSessionId,
            token: localSessionId
        }
    },
    async authorize(globalSessionId: string | undefined, clientCode: string, redirectUrl: string) {
        const client = await clientService.getClientByCode(clientCode)
        if (client === null) {
            throw new CustomError('非法client代码')
        }
        if (!client.extAttributes.validRedirectUrls.some(u => redirectUrl.startsWith(u))) {
            throw new CustomError('非法重定向地址')
        }
        const userString = await redis.get(`global_session:${globalSessionId}`)
        if (!userString || !globalSessionId) {
            return {
                isLogin: false,
                code: null
            }
        }
        const code = crypto.randomUUID()
        await Promise.all([
            redis.expire(`global_session:${globalSessionId}`, env.REDIS_EXPIRE_TIME),
            redis.set(`auth_code:${code}`, JSON.stringify(
                {
                    sessionId: globalSessionId,
                    data: userString
                }
            ), 'EX', env.AUTH_CODE_EXPIRE_TIME),
            // redis.set(`global_session_for_code:${code}`, globalSessionId, 'EX', env.AUTH_CODE_EXPIRE_TIME)
        ])
        return {
            isLogin: true,
            code: code
        }
    }

}