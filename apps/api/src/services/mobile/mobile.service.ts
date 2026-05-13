import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import redis from "@api/lib/clients/redis";
import smsClient from "@api/lib/integrations/sms";
import { CustomError } from "@iam/api-core/errors/CustomError";
import db from "@iam/db";
import { firstRow } from "@iam/db/query-utils";
import { users } from "@iam/db/schema";
import { count, eq } from "drizzle-orm";

const MOBILE_REGEX = /^1[3-9]\d{9}$/;

export async function sendCode(phoneNumber: string, usage: string) {
  if (!checkValidPhoneNumber(phoneNumber)) {
    throw new CustomError("无效手机号");
  }
  if (!await checkExistingPhoneNumber(phoneNumber) && usage !== VerificationCodeUsage.BindPhone) {
    throw new CustomError("手机号不存在");
  }
  const result = await smsClient.sendVerificationCode(phoneNumber);
  if (result.success === false) {
    throw new CustomError(`短信发送失败:${phoneNumber}`);
  }
  await redis.set(`mobile-code:${usage}:${phoneNumber}`, result.code, "EX", 180);
  return true;
}

export async function sendMessage(phoneNumber: string, message: string) {
  await smsClient.sendMessage(phoneNumber, message);
  return true;
}

export function checkValidPhoneNumber(phone: string): boolean {
  // 去除前后空格
  const trimmedPhone = phone.trim();
  // 正则表达式：以1开头，第二位为3-9之间的数字，总共11位
  // const reg = /^1[3-9]\d{9}$/;
  return MOBILE_REGEX.test(trimmedPhone);
}

export function getPurveyorWelcomeMessage(name: string): string {
  return `尊敬的${name}：
诚挚邀请贵司成为我司的候选供应商。请通过网站 https://tender.shgas.com.cn/tender-portal/ 完成相关信息登记，登录时请选择“手机号验证码登录”方式。感谢贵司的支持与配合！
上海燃气有限公司`;
}

export async function checkExistingPhoneNumber(phone: string): Promise<boolean> {
  const rows = await db.select({ value: count() }).from(users).where(eq(users.mobile, phone));
  return (firstRow(rows)?.value ?? 0) !== 0;
}

export async function cehckVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
  const savedCode = await redis.get(`mobile-code:${usage}:${phone}`);
  return savedCode === code;
}
