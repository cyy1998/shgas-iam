export type LegacyLoginLog = {
  id: number;
  userId: number;
  username: string;
  name: string;
  clientCode: string;
  loginType: string;
  loginTime: Date | string;
};

export type LoginLogAuditMigrationOptions = {
  dryRun: boolean;
  batchSize: number;
  sampleSize: number;
};

export type AuditLogMigrationValue = {
  eventTime: Date;
  action: string;
  outcome: "success";
  actorType: "user";
  actorUserId: number;
  actorUsername: string;
  actorClientCode: null;
  actorSystemKey: null;
  targetType: "user";
  targetId: number;
  targetCode: string;
  sourceApp: "iam";
  requestId: null;
  traceId: null;
  ip: null;
  userAgent: null;
  route: null;
  method: null;
  details: {
    migrationSource: "login_log";
    legacyLoginLogId: number;
    loginType: string;
    clientCode: string;
  };
};

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_SAMPLE_SIZE = 5;

function readPositiveInteger(value: string | undefined, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseLoginLogAuditMigrationArgs(
  args: string[],
): LoginLogAuditMigrationOptions {
  const options: LoginLogAuditMigrationOptions = {
    dryRun: true,
    batchSize: DEFAULT_BATCH_SIZE,
    sampleSize: DEFAULT_SAMPLE_SIZE,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--execute") {
      options.dryRun = false;
      continue;
    }
    if (arg === "--batch-size") {
      options.batchSize = readPositiveInteger(args[index + 1], "--batch-size");
      index += 1;
      continue;
    }
    if (arg.startsWith("--batch-size=")) {
      options.batchSize = readPositiveInteger(arg.split("=")[1], "--batch-size");
      continue;
    }
    if (arg === "--sample-size") {
      options.sampleSize = readPositiveInteger(args[index + 1], "--sample-size");
      index += 1;
      continue;
    }
    if (arg.startsWith("--sample-size=")) {
      options.sampleSize = readPositiveInteger(arg.split("=")[1], "--sample-size");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function mapLoginTypeToAuditAction(loginType: string) {
  const normalized = loginType.trim().toLowerCase();
  if (normalized.includes("密码")) {
    return "auth.login.password.success";
  }
  if (normalized.includes("短信") || normalized.includes("验证码") || normalized.includes("手机")) {
    return "auth.login.mobile.success";
  }
  if (normalized.includes("微信")) {
    return "auth.login.wechat.success";
  }
  if (normalized.includes("局部")) {
    return "auth.login.local.success";
  }

  switch (normalized) {
    case "password":
    case "pwd":
      return "auth.login.password.success";
    case "mobile":
    case "sms":
      return "auth.login.mobile.success";
    case "oa":
      return "auth.login.oa.success";
    case "wechat":
      return "auth.login.wechat.success";
    case "local":
      return "auth.login.local.success";
    default:
      return "auth.login.success";
  }
}

export function mapLoginLogToAuditLog(row: LegacyLoginLog): AuditLogMigrationValue {
  return {
    eventTime: row.loginTime instanceof Date ? row.loginTime : new Date(row.loginTime),
    action: mapLoginTypeToAuditAction(row.loginType),
    outcome: "success",
    actorType: "user",
    actorUserId: row.userId,
    actorUsername: row.username,
    actorClientCode: null,
    actorSystemKey: null,
    targetType: "user",
    targetId: row.userId,
    targetCode: row.username,
    sourceApp: "iam",
    requestId: null,
    traceId: null,
    ip: null,
    userAgent: null,
    route: null,
    method: null,
    details: {
      migrationSource: "login_log",
      legacyLoginLogId: row.id,
      loginType: row.loginType,
      clientCode: row.clientCode,
    },
  };
}
