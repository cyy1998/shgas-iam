import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import type { WechatBindingCodeScope } from "@api/services/authentication/wechat-binding.type";
import { InvalidMobileError, UserNotFoundError } from "@iam/domain/user";
import { SmsCooldownError, SmsSendFailedError, SmsUnavailableError } from "./mobile.error";
import type { MobileServiceDeps } from "./mobile.port";

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

function wechatBindingCodeKey(scope: WechatBindingCodeScope) {
  return `wechat-binding-code:${scope.requestId}:${scope.userId}:${scope.phoneNumber}`;
}

const saveWechatBindingCodeScript = `
local time = redis.call("TIME")
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local ttl = math.min(tonumber(ARGV[2]) - now, tonumber(ARGV[3]))
if ttl <= 0 then return 0 end
redis.call("SET", KEYS[1], ARGV[1], "PX", ttl)
return 1
`;

export function createMobileService(deps: MobileServiceDeps) {
  async function sendCode(inputPhoneNumber: string, usage: string) {
    const phoneNumber = inputPhoneNumber.trim();
    if (!checkValidPhoneNumber(phoneNumber)) {
      throw new InvalidMobileError("无效手机号");
    }
    if (
      usage !== VerificationCodeUsage.BindPhone &&
      (await deps.userRepository.getUserByMobile(phoneNumber)) === null
    ) {
      throw new UserNotFoundError("手机号不存在");
    }
    const code = await deliverVerificationCode(phoneNumber);
    try {
      await deps.redis.set(mobileCodeKey(usage, phoneNumber), code, "EX", deps.config.verificationCodeTtlSeconds);
    } catch {
      throw new SmsUnavailableError();
    }
    return true;
  }

  async function deliverVerificationCode(phoneNumber: string) {
    let remaining: number;
    try {
      remaining = await deps.cooldown.acquire(phoneNumber);
    } catch {
      throw new SmsUnavailableError();
    }
    if (remaining > 0) throw new SmsCooldownError(remaining);

    try {
      const result = await deps.smsSender.sendVerificationCode(phoneNumber);
      if (!result.success) throw new Error("SMS provider rejected send");
      return result.code;
    } catch {
      try {
        remaining = await deps.cooldown.remainingSeconds(phoneNumber);
      } catch {
        throw new SmsUnavailableError();
      }
      throw new SmsSendFailedError(remaining);
    }
  }

  async function sendWechatBindingCode(scope: WechatBindingCodeScope): Promise<boolean> {
    const code = await deliverVerificationCode(scope.phoneNumber);
    try {
      const saved = await deps.redis.eval(
        saveWechatBindingCodeScript,
        1,
        wechatBindingCodeKey(scope),
        String(code),
        String(scope.expiresAt),
        String(deps.config.verificationCodeTtlSeconds * 1000),
      );
      return saved === 1;
    } catch {
      throw new SmsUnavailableError();
    }
  }

  async function consumeWechatBindingCode(scope: WechatBindingCodeScope, code: string): Promise<boolean> {
    try {
      return (await deps.redis.eval(consumeVerificationCodeScript, 1, wechatBindingCodeKey(scope), code)) === 1;
    } catch {
      throw new SmsUnavailableError();
    }
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

  async function checkVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
    const savedCode = await deps.redis.get(mobileCodeKey(usage, phone.trim()));
    return savedCode === code;
  }

  async function consumeVerificationCode(usage: string, phone: string, code: string): Promise<boolean> {
    const result = await deps.redis.eval(consumeVerificationCodeScript, 1, mobileCodeKey(usage, phone.trim()), code);
    return result === 1;
  }

  return {
    sendCode,
    sendMessage,
    checkValidPhoneNumber,
    getPurveyorWelcomeMessage,
    checkVerificationCode,
    consumeVerificationCode,
    sendWechatBindingCode,
    consumeWechatBindingCode,
  };
}

export type MobileService = ReturnType<typeof createMobileService>;
