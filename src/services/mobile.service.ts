import { config } from '../config'
import { VerificationCodeUsage } from '@constants/verificationCode.usage'
import { CustomError } from '@errors/CustomError'
import { redis } from "../libs/cache/redis"
import { prisma } from '@database/db'
import type { SMSServiceResult } from '@schemas/service.type'
import { hmacSha256 } from '../utils/encryption.utils'

export const mobileService = {
    // async sendCodeWithExistingPhone(phoneNumber: string) {
    //     if (!this.checkValidPhoneNumber(phoneNumber)) {
    //         throw new CustomError('无效手机号')
    //     }
    //     if (!await this.checkExistingPhoneNumber(phoneNumber)) {
    //         throw new CustomError('手机号不存在')
    //     }
    //     return await this.sendVerificationCode(phoneNumber)
    // },
    // async sendCodeWithOutExistingPhone(phoneNumber: string) {
    //     if (!this.checkValidPhoneNumber(phoneNumber)) {
    //         throw new CustomError('无效手机号')
    //     }
    //     return await this.sendVerificationCode(phoneNumber)
    // },
    async sendCode(phoneNumber: string, usage: string) {
        if (!this.checkValidPhoneNumber(phoneNumber)) {
            throw new CustomError('无效手机号')
        }
        if (!await this.checkExistingPhoneNumber(phoneNumber) && usage !== VerificationCodeUsage.BindPhone) {
            throw new CustomError('手机号不存在')
        }
        return await this.sendVerificationCode(phoneNumber, usage)
    },
    async sendVerificationCode(phoneNumber: string, usage: string) {
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
            'signature': hmacSha256(data, config.SMS_SIGNATURE_KEY)
        }
        const res = await fetch(process.env.SMS_URL as string, {
            method: 'POST',
            body: JSON.stringify(request_data),
            headers: { "Content-Type": "application/json", "Accept": "application/json" }
        })
        const smsResult: SMSServiceResult = await res.json() as SMSServiceResult
        if (smsResult.resultCode !== '0000') {
            throw new CustomError(`短信发送失败:${phoneNumber}`)
        }
        await redis.set(`mobile-code:${usage}:${phoneNumber}`, random4Digit, 'EX', 180)
        return true
    },

    async sendMessage(phoneNumber: string, message: string) {
        const currentTimestamp = Math.floor(Date.now() / 1000)
        const origin = 'SHGAS'
        const data = currentTimestamp.toString() + origin + phoneNumber + message
        const request_data = {
            "mobile": phoneNumber,
            "message": message,
            "timestamp": currentTimestamp,
            "origin": origin,
            'signature': hmacSha256(data, config.SMS_SIGNATURE_KEY)
        }
        const res = await fetch(config.SMS_URL, {
            method: 'POST',
            body: JSON.stringify(request_data),
            headers: { "Content-Type": "application/json", "Accept": "application/json" }
        })
        console.log(await res.json())
        return true
    },

    checkValidPhoneNumber(phone: string): boolean {
        // 去除前后空格
        const trimmedPhone = phone.trim();
        // 正则表达式：以1开头，第二位为3-9之间的数字，总共11位
        const reg = /^1[3-9]\d{9}$/;
        return reg.test(trimmedPhone);
    },

    getPurveyorWelcomeMessage(name: string): string {
        return `尊敬的${name}：
诚挚邀请贵司成为我司的候选供应商。请通过网站 https://tender.shgas.com.cn/tender-portal/ 完成相关信息登记，登录时请选择“手机号验证码登录”方式。感谢贵司的支持与配合！
上海燃气有限公司`
    },

    async checkExistingPhoneNumber(phone: string): Promise<boolean> {
        const userCount = await prisma.user.count({
            where: {
                mobile: phone
            }
        })
        return userCount !== 0
    },

    async cehckVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
        const savedCode = await redis.get(`mobile-code:${usage}:${phone}`)
        return savedCode === code
    }

}