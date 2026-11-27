import { readFile } from "node:fs/promises";

export interface ManagedIamInput {
  environment: "shrq-srv-test" | "shrq-srv-prod";
  origin: string;
  database: string;
  databaseUrl: string;
  admin: { username: string; password: string };
  redis: { host: string; port: number; db: number; username?: string; password?: string };
}

export function parseManagedIamInput(raw: unknown): ManagedIamInput {
  const value = raw as ManagedIamInput;
  try {
    if (
      !["shrq-srv-test", "shrq-srv-prod"].includes(value.environment) ||
      typeof value.admin?.username !== "string" ||
      !value.admin.username ||
      typeof value.admin.password !== "string" ||
      !value.admin.password
    )
      throw new Error();
    const origin = new URL(value.origin),
      database = new URL(value.databaseUrl);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.origin !== value.origin ||
      origin.username ||
      origin.password ||
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      decodeURIComponent(database.pathname.slice(1)) !== value.database ||
      value.database !== `iam_${value.environment.replaceAll("-", "_")}`
    )
      throw new Error();
    if (
      typeof value.redis?.host !== "string" ||
      !value.redis.host ||
      !Number.isInteger(value.redis.port) ||
      value.redis.port < 1 ||
      value.redis.port > 65535 ||
      !Number.isInteger(value.redis.db) ||
      value.redis.db < 0 ||
      value.redis.db > 15 ||
      (value.redis.password !== undefined && typeof value.redis.password !== "string") ||
      (value.redis.username !== undefined && typeof value.redis.username !== "string")
    )
      throw new Error();
    return value;
  } catch {
    throw new Error("托管 IAM 输入必须对应本次正式初始化的环境、账号、IAM 数据库和 Redis 映射");
  }
}

export async function readManagedIamInput(file = process.env.IAM_MANAGED_ACCEPTANCE_INPUT_FILE) {
  if (!file) throw new Error("IAM_MANAGED_ACCEPTANCE_INPUT_FILE 必须指向本次正式初始化后的私有输入");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error("无法读取 IAM 正式托管验收私有输入");
  }
  return parseManagedIamInput(raw);
}

export function managedIamFailure(error: unknown, input: ManagedIamInput) {
  const format = (value: unknown): string =>
    value instanceof AggregateError
      ? [value.message, ...value.errors.map(format)].join("\n")
      : value instanceof Error
        ? value.message
        : "managed-iam-journey-failed";
  return new Error(redactManagedIamText(format(error), input));
}

export function redactManagedIamText(text: string, input: ManagedIamInput) {
  let message = text;
  const database = new URL(input.databaseUrl);
  const privateValues = [
    input.admin.password,
    JSON.stringify(input.admin.password).slice(1, -1),
    input.databaseUrl,
    database.password,
    decodeURIComponent(database.password),
    input.redis.password ?? "",
  ].filter(Boolean);
  for (const value of privateValues.sort((left, right) => right.length - left.length))
    message = message.replaceAll(value, "[REDACTED]");
  return message
    .replace(/([?&](?:code|token|session|ticket|state|ssoReturn|oidcReturn|loginId)=)[^&#\s"']+/gi, "$1[REDACTED]")
    .replace(/((?:authorization|cookie|set-cookie)\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]");
}
