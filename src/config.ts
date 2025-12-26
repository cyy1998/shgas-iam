import { z } from 'zod';

const EnvSchema = z.object({
    PASSWORD_HASH_ROUNDS: z.coerce.number().default(10),
    SMS_SIGNATURE_KEY: z.string(),
    SMS_URL: z.string(),
    DEFAULT_USER_PASSWORD: z.string(),
    REDIS_EXPIRE_TIME: z.coerce.number(),
    ORCAS_URL: z.string(),
    IAM_SECRET_KEY: z.string(),
    PORT: z.coerce.number().default(30000),
    WX_CORPID: z.string(),
    WX_CORPSECRET: z.string(),
    MAGIC_CODE: z.string(),
    NODE_ENV: z.string(),
    PURVEYOR_PARENT_ORG: z.string()
});

export type Env = z.infer<typeof EnvSchema>;

// 从 process.env 或 Deno.env 获取（根据运行时调整）
const rawEnv = process.env

export const env = EnvSchema.parse(rawEnv);