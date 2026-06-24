import type { RedisPort } from "@api/composition/runtime";
import type { UserRepository } from "@api/services/user/user.repository";

export interface SmsSenderPort {
  sendVerificationCode: (phoneNumber: string) => Promise<{ success: boolean; code: number | string }>;
  sendMessage: (phoneNumber: string, message: string) => Promise<unknown>;
}

export interface MobileServiceDeps {
  redis: Pick<RedisPort, "get" | "set" | "eval">;
  smsSender: SmsSenderPort;
  userRepository: Pick<UserRepository, "getUserByMobile">;
  config: {
    verificationCodeTtlSeconds: number;
  };
}
