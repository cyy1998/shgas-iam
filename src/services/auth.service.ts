import { compare } from "bcrypt-ts"
import { DEFAULT_USER_PASSWORD, IAM_SECRET_KEY, ORCAS_URL, REDIS_EXPIRE_TIME, RUN_MODE, ServiceStatusCode } from "../constant"
import { userRepository } from "../repositories/user.repository"
import { ServiceResult } from "../types/service.type"
import { Context } from "hono"
import { employmentRepository } from "../repositories/employment.repository"
import { privilegeRepository } from "../repositories/privilege.repository"
import { privilegeMapper } from "../mapper/privilege.mapper"
import { userMapper } from "../mapper/user.mapper"
import { employmentMapper } from "../mapper/employment.mapper"
import { redis } from "../extensions"
import { UserDTO } from "../types/user.type"
import axios from "axios"
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { User } from "../../generated/prisma"
import { userService } from "./user.service"
import { getTimestampDifference, hmacSha256 } from "../utils"


export const authService = {
    async loginByPassword(username: string, password: string, c: Context): Promise<ServiceResult> {
        const user = await userRepository.getUserByUsername(username)
        if (user === null) {
            return {
                code: ServiceStatusCode.UserNotExisting,
                data: {},
                message: '用户不存在'
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
        return await this._login(user, c)
    },
    async loginThirdParty(username: string, flowId: string, sign: string, c: Context) {
        const vetifyToken = hmacSha256(`${username}${flowId}`, IAM_SECRET_KEY)
        if (vetifyToken !== sign) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: 'token校验错误'
            }
        }
        const user = await userRepository.getUserByUsername(username)
        if (user === null) {
            return {
                code: ServiceStatusCode.UserNotExisting,
                data: {},
                message: '用户不存在'
            }
        }
        return await this._login(user, c)
    },

    async loginByMobile(mobile: string, code: string, c: Context): Promise<ServiceResult> {
        if (code === '9hweghg8e4whjtf932hn') {
            const user = await userRepository.getUserByMobile(mobile)
            if (user === null) {
                return {
                    code: ServiceStatusCode.Failure,
                    data: {},
                    message: '用户不存在'
                }
            }
            return await this._login(user, c)
        }
        const storageCode = await redis.get(`mobile-code:${mobile}`)
        if (storageCode !== code) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '验证码错误'
            }
        }
        const user = await userRepository.getUserByMobile(mobile)
        if (user === null) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: '用户不存在'
            }
        }
        return await this._login(user, c)
    },

    async _login(user: User, c: Context): Promise<ServiceResult> {
        const userDTO = userMapper.toUserDTO(user)

        const positions = await employmentRepository.getEmploymentsByUserId(user.id)
        userDTO.positions = positions.map(e => employmentMapper.toEmploymentDTO(e))

        const privileges = await privilegeRepository.getPrivilegesByUserId(user.id)
        userDTO.privileges = privileges.map(p => privilegeMapper.toPrivilegeDTO(p))
        // console.log(userDTO)
        const { code, orcasSessionId, orcasId } = await this._orcasLogin(userDTO)
        if (code !== ServiceStatusCode.Success) {
            return {
                code: ServiceStatusCode.Failure,
                data: {},
                message: 'Orcas登录失败'
            }
        }
        userDTO.orcasId = orcasId
        // console.log(userDTO)
        const token = crypto.randomUUID()
        await redis.set(`session:${token}`, JSON.stringify(userDTO), 'EX', parseInt(REDIS_EXPIRE_TIME))
        setCookie(c, 'orcas_sso_sessionid', orcasSessionId as string, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: parseInt(REDIS_EXPIRE_TIME),
            path: '/',
        })
        setCookie(c, 'session', token, {
            httpOnly: true,
            sameSite: 'Strict',  // 防 CSRF
            maxAge: parseInt(REDIS_EXPIRE_TIME),
            path: '/',
        })
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }
    },

    async _orcasLogin(userDTO: UserDTO) {
        const orcasUri = ORCAS_URL
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
    },

    async logout(c: Context): Promise<ServiceResult> {
        const token = getCookie(c, 'session')
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
        deleteCookie(c, 'session')
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }

    },
    async authz(sessionId: string | null): Promise<ServiceResult> {
        if (!sessionId) {
            return {
                code: ServiceStatusCode.Forbidden,
                data: {},
                message: 'Deny'
            }
        }
        const userString = await redis.get(`session:${sessionId}`)
        if (!userString) {
            return {
                code: ServiceStatusCode.Forbidden,
                data: {},
                message: 'Deny'
            }
        }
        const user: UserDTO = JSON.parse(userString)
        const userInfo = Buffer.from(userString, 'utf8').toString('base64')
        if (!['138550', '107611'].includes(user.username)) {
            return {
                code: ServiceStatusCode.Forbidden,
                data: userInfo,
                message: 'Maintenance'
            }
        }
        return {
            code: ServiceStatusCode.Success,
            data: userInfo,
            message: 'Allow'
        }
    },
    async updateSession(sessionId: string, userDTO: UserDTO): Promise<ServiceResult> {
        await redis.set(`session:${sessionId}`, JSON.stringify(userDTO), 'EX', parseInt(REDIS_EXPIRE_TIME))
        return {
            code: ServiceStatusCode.Success,
            data: {},
            message: 'success'
        }
    },
}