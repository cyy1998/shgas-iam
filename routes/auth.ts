import { Hono } from 'hono'

import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { getEvenLengthSubstrings, hmacSha256 } from '../utils'
import { redis, prisma } from '../extensions'
import { getEmploymentDTO, getOrgDTO, getPrivDTO, getUserDTO, PrivDTO } from '../dto'
import { userService } from '../services/userService'

const app = new Hono()

app.post('/login', async (c) => {
    const body = await c.req.json()
    const { user, userDTO, sessionId, message, code } = await userService.createUserSession({
        username: body.username
    }, true, body.password)
    if (!user) {
        return c.json({ message: message }, 401)
    }
    const { res, orcasSessionId } = await userService.orcasLogin(userDTO)
    if (res !== 'success') {
        return c.json({ message: 'orcas登录失败' }, 500)
    }
    setCookie(c, 'session', sessionId, {
        httpOnly: true,
        sameSite: 'Strict',  // 防 CSRF
        maxAge: parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'),        // 1小时（单位：秒）
        path: '/',
    })
    setCookie(c, 'orcas_sso_sessionid', orcasSessionId as string, {
        httpOnly: true,
        sameSite: 'Strict',  // 防 CSRF
        maxAge: parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'),        // 1小时（单位：秒）
        path: '/',
    })
    return c.json({ message: 'Success' }, 200)
})

app.post('/logout', async (c) => {
    const token = getCookie(c, 'session')
    if (token) {
        const result = await redis.del(`session:${token}`)
        deleteCookie(c, 'session')
        if (result === 1) {
            return c.json({ message: 'Success' }, 200)
        } else {
            return c.json({ message: 'Invalid Token' }, 401)
        }

    }
    else {
        return c.json({ message: "Unauthorized" }, 401)
    }

})

app.post('/send-message', async (c) => {
    const phoneNumber = (await c.req.json()).phoneNumber
    if (!phoneNumber) {
        return c.json({ message: "无效手机号" }, 400)
    }
    const user = await prisma.user.findFirst({
        where: {
            mobilePhone: phoneNumber
        }
    })
    if (!user) {
        return c.json({ message: "无效手机号" }, 400)
    }
    const random4Digit = Math.floor(1000 + Math.random() * 9000)
    const message = `登录验证码：${random4Digit}`
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const origin = 'SHGAS'
    const data = currentTimestamp.toString() + origin + phoneNumber + message
    const request_data = {
        "mobile": phoneNumber,
        "message": message,
        "timestamp": currentTimestamp,
        "origin": origin,
        'signature': hmacSha256(data, "aa8099eb32c945f39157f339d8fd702c")
    }
    const res = await fetch(process.env.SMS_URL as string, {
        method: 'POST',
        body: JSON.stringify(request_data),
        headers: { "Content-Type": "application/json", "Accept": "application/json" }
    })
    redis.set(`mobile-code:${phoneNumber}`, random4Digit, 'EX', 180)
    return c.json({ message: 'Success' })
})

app.post('/mobile-login', async (c) => {
    const body = await c.req.json()
    const storageCode = await redis.get(`mobile-code:${body.phoneNumber}`)
    if (storageCode !== body.code) {
        return c.json({ message: "验证码错误" }, 401)
    }
    const { user, userDTO, sessionId, message, code } = await userService.createUserSession({
        mobilePhone: body.phoneNumber
    }, false)
    if (!user) {
        return c.json({ message: message }, 401)
    }
    const { res, orcasSessionId } = await userService.orcasLogin(userDTO)
    if (res !== 'success') {
        return c.json({ message: 'orcas登录失败' }, 500)
    }
    setCookie(c, 'session', sessionId, {
        httpOnly: true,
        sameSite: 'Strict',  // 防 CSRF
        maxAge: parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'),        // 1小时（单位：秒）
        path: '/',
    })
    setCookie(c, 'orcas_sso_sessionid', orcasSessionId as string, {
        httpOnly: true,
        sameSite: 'Strict',  // 防 CSRF
        maxAge: parseInt(process.env.REDIS_EXPIRE_TIME ?? '3600'),        // 1小时（单位：秒）
        path: '/',
    })

    return c.json({ message: 'Success' }, 200)
})

app.get('/authz', async (c) => {
    const query_uri = c.req.header('X-Forwarded-Uri')
    // console.log(await c.req.json())
    const token = getCookie(c, 'session')
    if (!token) {
        return c.json({ message: "Deny" }, 401)
    }

    const userString = await redis.get(`session:${token}`)
    if (!userString) {
        return c.json({ message: "Deny" }, 401)
    }
    const userDTO = JSON.parse(userString)
    const apiPriv = userDTO.privileges.filter((p: PrivDTO) => p.objType === 'api')
    const user = Buffer.from(userString, 'utf8').toString('base64')
    c.header('X-User-Info', user)
    return c.json({ message: "Allow" }, 200)
})

export default app