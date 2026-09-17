import type { RedisPort } from "@api/composition/runtime";

export interface SmsSenderPort {
  sendVerificationCode: (phoneNumber: string) => Promise<{ success: boolean; code: number | string }>;
  sendMessage: (phoneNumber: string, message: string) => Promise<unknown>;
}

export interface MobileUserReaderPort {
  getUserByMobile: (mobile: string) => Promise<unknown | null>;
}

export interface MobileServiceDeps {
  cooldown: {
    /** Returns zero when acquired, otherwise the remaining wait in seconds. */
    acquire: (phone: string) => Promise<number>;
    remainingSeconds: (phone: string) => Promise<number>;
  };
  redis: Pick<RedisPort, "del" | "eval" | "get" | "set" | "ttl">;
  smsSender: SmsSenderPort;
  userRepository: MobileUserReaderPort;
  config: {
    verificationCodeTtlSeconds: number;
  };
}
