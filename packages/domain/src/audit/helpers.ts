import type { AuditActor, AuditDetails } from "./audit.type";
import { AuditActorSchema, AuditDetailsSchema } from "./schema";

const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set([
  "apikey",
  "authorization",
  "captcha",
  "clientsecret",
  "client_secret",
  "code",
  "cookie",
  "otp",
  "password",
  "passwordhash",
  "password_hash",
  "pwd",
  "refresh_token",
  "refreshtoken",
  "secret",
  "set-cookie",
  "smscode",
  "sms_code",
  "token",
  "verificationcode",
  "verification_code",
]);

function normalizeKey(key: string) {
  return key.replace(/[^\w-]/g, "").toLowerCase();
}

function shouldRedactKey(key: string) {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEYS.has(normalized)
    || normalized.endsWith("token")
    || normalized.endsWith("_token")
    || normalized.endsWith("-token");
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactValue(item));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        shouldRedactKey(key) ? REDACTED : redactValue(item),
      ]),
    );
  }
  return value;
}

export function normalizeAuditActor(input: AuditActor): AuditActor {
  const actor = AuditActorSchema.parse(input);
  if (actor.actorType === "user" || actor.actorType === "admin") {
    return {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorUsername: actor.actorUsername,
      actorClientCode: null,
      actorSystemKey: null,
    };
  }
  if (actor.actorType === "client") {
    return {
      actorType: actor.actorType,
      actorUserId: null,
      actorUsername: null,
      actorClientCode: actor.actorClientCode,
      actorSystemKey: null,
    };
  }
  if (actor.actorType === "system") {
    return {
      actorType: actor.actorType,
      actorUserId: null,
      actorUsername: null,
      actorClientCode: null,
      actorSystemKey: actor.actorSystemKey,
    };
  }
  return {
    actorType: "anonymous",
    actorUserId: null,
    actorUsername: null,
    actorClientCode: null,
    actorSystemKey: null,
  };
}

export function redactAuditDetails(details: AuditDetails | undefined): AuditDetails {
  const redacted = redactValue(details ?? {});
  return AuditDetailsSchema.parse(redacted);
}

export { REDACTED as AUDIT_REDACTED_VALUE };
