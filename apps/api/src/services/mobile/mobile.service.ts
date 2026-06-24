import type { MobileServiceDeps } from "./mobile.port";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidMobileError, UserNotFoundError } from "@iam/domain/user";

const MOBILE_REGEX = /^1[3-9]\d{9}$/;
const consumeVerificationCodeScript = `
local saved = redis.call("GET", KEYS[1])
if not saved then
  return 0
end
if saved ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

function mobileCodeKey(usage: string, phone: string) {
  return `mobile-code:${usage}:${phone}`;
}

export function createMobileService(deps: MobileServiceDeps) {
  async function sendCode(phoneNumber: string, usage: string) {
    if (!checkValidPhoneNumber(phoneNumber)) {
      throw new InvalidMobileError("无效手机号");
    }
    if (!await checkExistingPhoneNumber(phoneNumber) && usage !== VerificationCodeUsage.BindPhone) {
      throw new UserNotFoundError("手机号不存在");
    }
    const result = await deps.smsSender.sendVerificationCode(phoneNumber);
    if (result.success === false) {
      throw new CustomError(`短信发送失败:${phoneNumber}`);
    }
    await deps.redis.set(mobileCodeKey(usage, phoneNumber), result.code, "EX", deps.config.verificationCodeTtlSeconds);
    return true;
  }

  async function sendMessage(phoneNumber: string, message: string) {
    await deps.smsSender.sendMessage(phoneNumber, message);
    return true;
  }

  function checkValidPhoneNumber(phone: string): boolean {
    const trimmedPhone = phone.trim();
    return MOBILE_REGEX.test(trimmedPhone);
  }

  function getPurveyorWelcomeMessage(name: string): string {
    return `尊敬的${name}：
诚挚邀请贵司成为我司的候选供应商。请通过网站 https://tender.shgas.com.cn/tender-portal/ 完成相关信息登记，登录时请选择“手机号验证码登录”方式。感谢贵司的支持与配合！
上海燃气有限公司`;
  }

  async function checkExistingPhoneNumber(phone: string): Promise<boolean> {
    return await deps.userRepository.getUserByMobile(phone) !== null;
  }

  async function checkVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
    const savedCode = await deps.redis.get(mobileCodeKey(usage, phone));
    return savedCode === code;
  }

  async function consumeVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
    const result = await deps.redis.eval(consumeVerificationCodeScript, 1, mobileCodeKey(usage, phone), code);
    return result === 1;
  }

  return {
    sendCode,
    sendMessage,
    checkValidPhoneNumber,
    getPurveyorWelcomeMessage,
    checkExistingPhoneNumber,
    checkVerificationCode,
    consumeVerificationCode,
  };
}

export type MobileService = ReturnType<typeof createMobileService>;
