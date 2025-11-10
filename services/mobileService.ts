import { SMS_SIGNATURE_KEY } from '../constant'
import { redis, prisma } from '../extensions'
import { hmacSha256 } from '../utils'

export const mobileService = {
    async sendVerificationCode(phoneNumber: string): Promise<boolean> {
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
            'signature': hmacSha256(data, SMS_SIGNATURE_KEY)
        }
        const res = await fetch(process.env.SMS_URL as string, {
            method: 'POST',
            body: JSON.stringify(request_data),
            headers: { "Content-Type": "application/json", "Accept": "application/json" }
        })
        console.log(await res.json())
        await redis.set(`mobile-code:${phoneNumber}`, random4Digit, 'EX', 180)
        return true
    },
    checkValidPhoneNumber(phone: string): boolean {
        // 去除前后空格
        const trimmedPhone = phone.trim();
        // 正则表达式：以1开头，第二位为3-9之间的数字，总共11位
        const reg = /^1[3-9]\d{9}$/;
        return reg.test(trimmedPhone);
    },
    async checkExistingPhoneNumber(phone: string): Promise<boolean> {
        const userCount = await prisma.user.count({
            where: {
                mobilePhone: phone
            }
        })
        return userCount !== 0
    },
    async cehckVerificationCode(phone: string, code: string): Promise<boolean> {
        const savedCode = await redis.get(`mobile-code:${phone}`)
        return savedCode === code
    }

}