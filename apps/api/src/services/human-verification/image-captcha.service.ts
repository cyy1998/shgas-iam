import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ClockPort, RedisPort } from "@api/composition/runtime";
import type { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { ApiErrorCode, type ImageCaptchaAnswer } from "@iam/contracts";
import { BAD_REQUEST, TOO_MANY_REQUESTS } from "@iam/contracts/http";
import { CustomError } from "@iam/runtime/errors";
import type { HumanVerificationContext } from "./human-verification.type";
import { renderImageCaptcha } from "./image-captcha.renderer";

const CHALLENGE_MS = 120_000;
const TICKET_MS = 300_000;
const PROOF_MS = 60_000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const key = (kind: string, id: string) => `image-captcha:{iam}:${kind}:${id}`;

const takeRateSlot = `
local retry = 0
for i = 1, #KEYS do
  if tonumber(redis.call("GET", KEYS[i]) or "0") >= tonumber(ARGV[2*i-1]) then
    retry = math.max(retry, redis.call("PTTL", KEYS[i]))
  end
end
if retry > 0 then return retry end
for i = 1, #KEYS do
  if redis.call("INCR", KEYS[i]) == 1 then
    redis.call("PEXPIRE", KEYS[i], ARGV[2*i])
  end
end
return 0
`;

const replaceChallenge = `
if redis.call("EXISTS", KEYS[2]) == 1 then return 0 end
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
return 1
`;

const checkAnswer = `
local challenge = redis.call("GET", KEYS[1])
if not challenge or string.sub(challenge, 1, #ARGV[1]) ~= ARGV[1] then return 0 end
if challenge ~= ARGV[1] .. ARGV[2] then return 1 end
redis.call("SET", KEYS[3], ARGV[3], "PX", ARGV[4])
redis.call("SET", KEYS[2], "1", "PX", ARGV[5])
redis.call("DEL", KEYS[1])
return 2
`;

const consumeProof = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;

type ImageCaptchaDeps = {
  redis: Pick<RedisPort, "eval">;
  clock: Pick<ClockPort, "now">;
  enabled: boolean;
  secret: string;
  render?: typeof renderImageCaptcha;
};

function expiredTicket() {
  return new CustomError("安全校验已过期，请重新提交原操作", {
    code: ApiErrorCode.ImageCaptchaTicketExpired,
    httpStatus: BAD_REQUEST,
  });
}

class ImageCaptchaCooldownError extends CustomError {
  constructor(public readonly retryAfterSeconds: number) {
    super("操作过于频繁，请稍后重试", {
      code: ApiErrorCode.ImageCaptchaCooldown,
      httpStatus: TOO_MANY_REQUESTS,
    });
  }
}

const randomToken = () => randomBytes(32).toString("base64url");

export function createImageCaptchaService(deps: ImageCaptchaDeps) {
  function digest(purpose: string, value: string) {
    return createHmac("sha256", deps.secret).update(purpose).update("\0").update(value).digest("base64url");
  }

  function bindingFor(action: HumanVerificationAction, context: HumanVerificationContext) {
    return digest("image-captcha-operation", JSON.stringify([action, context.subject, context.sms]));
  }

  function issueTicket(action: HumanVerificationAction, context: HumanVerificationContext) {
    if (!deps.enabled || !context.subject) return undefined;
    const payload = `${randomToken()}.${bindingFor(action, context)}.${deps.clock.now() + TICKET_MS}`;
    return `${payload}.${digest("image-captcha-ticket", payload)}`;
  }

  function readTicket(ticket: string, graceMs = 0) {
    const [id, binding, expiry, signature, extra] = ticket.split(".");
    if (
      !deps.enabled ||
      extra !== undefined ||
      !id ||
      !binding ||
      !signature ||
      !TOKEN.test(id) ||
      !TOKEN.test(binding) ||
      !TOKEN.test(signature)
    ) {
      throw expiredTicket();
    }
    const expiresAt = Number(expiry);
    if (!Number.isSafeInteger(expiresAt) || deps.clock.now() >= expiresAt + graceMs) throw expiredTicket();
    const expected = digest("image-captcha-ticket", `${id}.${binding}.${expiry}`);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw expiredTicket();
    return { id, binding };
  }

  async function enforceRate(kind: "issue" | "answer", binding: string, ip?: string) {
    const source = digest("image-captcha-source", ip ?? "");
    const bindingLimit = kind === "issue" ? [10, 60_000] : [1, 1000];
    const sourceLimit = kind === "issue" ? [120, 60_000] : [180, 60_000];
    const remaining = await deps.redis.eval(
      takeRateSlot,
      2,
      key(`rate-${kind}-source`, source),
      key(`rate-${kind}-operation`, binding),
      ...sourceLimit,
      ...bindingLimit,
    );
    if (typeof remaining !== "number" || remaining < 0) throw new Error("Invalid image CAPTCHA rate state");
    if (remaining > 0) throw new ImageCaptchaCooldownError(Math.ceil(remaining / 1000));
  }

  async function createChallenge(ticket: string, ip?: string) {
    const { id, binding } = readTicket(ticket);
    await enforceRate("issue", binding, ip);
    const challengeId = randomToken();
    const { answer, imageBase64 } = (deps.render ?? renderImageCaptcha)();
    const replaced = await deps.redis.eval(
      replaceChallenge,
      2,
      key("challenge", id),
      key("solved", id),
      `${challengeId}:${digest(challengeId, answer)}`,
      CHALLENGE_MS,
    );
    if (replaced !== 1) throw expiredTicket();
    return { challengeId, imageBase64 };
  }

  async function verifyAnswer(
    ticket: string,
    challengeId: string,
    answer: string,
    ip?: string,
  ): Promise<ImageCaptchaAnswer> {
    const { id, binding } = readTicket(ticket, CHALLENGE_MS);
    await enforceRate("answer", binding, ip);
    const proof = randomToken();
    const result = await deps.redis.eval(
      checkAnswer,
      3,
      key("challenge", id),
      key("solved", id),
      key("proof", digest("image-captcha-proof", proof)),
      `${challengeId}:`,
      digest(challengeId, answer.trim().toUpperCase()),
      binding,
      PROOF_MS,
      TICKET_MS,
    );
    if (result === 2) return { result: "verified", proof };
    if (result === 1) return { result: "incorrect" };
    if (result === 0) return { result: "expired" };
    throw new Error("Invalid image CAPTCHA answer state");
  }

  async function verifyProof(action: HumanVerificationAction, context: HumanVerificationContext) {
    const proof = context.imageCaptchaProof;
    if (!deps.enabled || !proof || !TOKEN.test(proof) || !context.subject) return false;
    const consumed = await deps.redis.eval(
      consumeProof,
      1,
      key("proof", digest("image-captcha-proof", proof)),
      bindingFor(action, context),
    );
    return consumed === 1;
  }

  return { issueTicket, createChallenge, verifyAnswer, verifyProof };
}

export type ImageCaptchaService = ReturnType<typeof createImageCaptchaService>;
