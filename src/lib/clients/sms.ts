import config from "@/env";
import { hmacSha256 } from "@/utils/encryption.utils";
import { createSingleton } from "../core/singleton";

type SMSServiceResult = {
  resultCode: string;
  resultInfo: string;
  result: string;
};

function createSmsClient() {
  return {
    async sendVerificationCode(phoneNumber: string) {
      const random4Digit = Math.floor(1000 + Math.random() * 9000);
      const message = `验证码：${random4Digit}`;
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const origin = "SHGAS";
      const data = currentTimestamp.toString() + origin + phoneNumber + message;
      const request_data = {
        mobile: phoneNumber,
        message,
        timestamp: currentTimestamp,
        origin,
        signature: hmacSha256(data, config.SMS_SIGNATURE_KEY),
      };
      const res = await fetch(process.env.SMS_URL as string, {
        method: "POST",
        body: JSON.stringify(request_data),
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      const smsResult: SMSServiceResult = await res.json() as SMSServiceResult;
      if (smsResult.resultCode !== "0000") {
        return {
          success: false,
          message: smsResult.resultInfo,
          code: -1,
        };
      }
      //   await redis.set(`mobile-code:${usage}:${phoneNumber}`, random4Digit, 'EX', 180);
      return {
        success: true,
        message: "success",
        code: random4Digit,
      };
    },

    async sendMessage(phoneNumber: string, message: string) {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const origin = "SHGAS";
      const data = currentTimestamp.toString() + origin + phoneNumber + message;
      const request_data = {
        mobile: phoneNumber,
        message,
        timestamp: currentTimestamp,
        origin,
        signature: hmacSha256(data, config.SMS_SIGNATURE_KEY),
      };
      await fetch(config.SMS_URL, {
        method: "POST",
        body: JSON.stringify(request_data),
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      // console.log(await res.json());
      return true;
    },

    checkValidPhoneNumber(phone: string): boolean {
      // 去除前后空格
      const trimmedPhone = phone.trim();
      // 正则表达式：以1开头，第二位为3-9之间的数字，总共11位
      const reg = /^1[3-9]\d{9}$/;
      return reg.test(trimmedPhone);
    },

    // getPurveyorWelcomeMessage(name: string): string {
    //   return `尊敬的${name}：
    // 诚挚邀请贵司成为我司的候选供应商。请通过网站 https://tender.shgas.com.cn/tender-portal/ 完成相关信息登记，登录时请选择“手机号验证码登录”方式。感谢贵司的支持与配合！
    // 上海燃气有限公司`;
    // },

    // async cehckVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
    //   const savedCode = await redis.get(`mobile-code:${usage}:${phone}`);
    //   return savedCode === code;
    // },
  };
}

const smsClient = createSingleton(
  "sms",
  createSmsClient,
);

export default smsClient;
