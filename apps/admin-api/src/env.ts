import { z } from "@hono/zod-openapi";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PASSWORD_HASH_ROUNDS: z.coerce.number().default(10),
  PORT: z.coerce.number().default(30001),
  NODE_ENV: z.string().default("development"),
  REDIS_URL: z.string(),
  REDIS_PORT: z.coerce.number(),
  REDIS_PASSWORD: z.string().optional().transform(value => value || undefined),
  REDIS_DB: z.coerce.number(),
  LOG_LEVEL: z.string().default("info"),
  LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  ADMIN_CLIENT_CODES: z.string().default("iam-admin"),
  ADMIN_ROLE_CODES: z.string().default("iam:admin"),
});

export type Env = z.infer<typeof EnvSchema>;

const env = EnvSchema.parse(process.env);

export const adminClientCodes = env.ADMIN_CLIENT_CODES.split(",")
  .map(code => code.trim())
  .filter(Boolean);

export const adminRoleCodes = env.ADMIN_ROLE_CODES.split(",")
  .map(code => code.trim())
  .filter(Boolean);

export default env;
