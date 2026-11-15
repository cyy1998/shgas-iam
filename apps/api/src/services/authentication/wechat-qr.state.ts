import { createHash, randomBytes } from "node:crypto";
import { WechatQrIdSchema } from "@iam/contracts";
import { z } from "zod";

export interface WechatQrBrowser {
  protocol: "custom_sso" | "oidc";
  continuation: string;
  browserBinding: string;
}

const memberSchema = z.object({ userId: z.number().int().positive(), subjectIdentifier: z.uuid() });
export type RegisteredWechatQrMember = z.infer<typeof memberSchema>;

const requestSchema = z.intersection(
  z.object({ browser: z.string(), expiresAt: z.number().int(), applicationName: z.string(), device: z.string() }),
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("waiting") }),
    z.object({ status: z.literal("confirmed"), member: memberSchema }),
    z.object({
      status: z.literal("binding_required"),
      wxId: z.string().min(1),
      bindingOwner: z.object({ token: z.string(), member: memberSchema }).optional(),
    }),
    z.object({ status: z.literal("consumed") }),
    z.object({ status: z.literal("restart") }),
  ]),
);

const mobileSchema = z.object({ requestId: WechatQrIdSchema, browser: z.string() });
const confirmationSchema = mobileSchema.extend({ wxId: z.string().min(1) });
const newHandle = () => randomBytes(24).toString("hex");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const browserKey = (browser: WechatQrBrowser) =>
  digest(JSON.stringify([browser.protocol, browser.continuation, browser.browserBinding]));

// Redis is the clock and the sole writer of request outcomes.
const redisTime = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
`;
const currentRequest = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local request = cjson.decode(raw)
if redis.call('GET', ARGV[1] .. request.browser) ~= ARGV[2] then return nil end
`;
const waitingRequest = `${currentRequest}
if request.status ~= 'waiting' then return nil end
`;

const currentBindingRequest = `${currentRequest}
${redisTime}
if request.status ~= 'binding_required' or request.browser ~= ARGV[3] then return nil end
if request.expiresAt <= now or tonumber(ARGV[4]) <= now then return nil end
`;

export interface AuthorizedWechatQrBinding {
  browser: WechatQrBrowser;
  requestId: string;
  wxId: string;
  expiresAt: number;
}

interface WechatQrRedis {
  eval: (script: string, keyCount: number, ...keysAndArgs: string[]) => Promise<unknown>;
}

export function createWechatQrState(redis: WechatQrRedis, namespace: string) {
  const prefix = `${namespace}:wechat-qr:v1:`;
  const requestPrefix = `${prefix}request:`;
  const browserPrefix = `${prefix}browser:`;
  const requestKey = (requestId: string) => `${requestPrefix}${requestId}`;
  const oauthKey = (state: string) => `${prefix}oauth:${digest(state)}`;
  const confirmationKey = (flowId: string) => `${prefix}confirmation:${digest(flowId)}`;

  async function execute(script: string, keyCount: number, ...keysAndArgs: string[]) {
    try {
      return await redis.eval(script, keyCount, ...keysAndArgs);
    } catch {
      throw new Error("WeChat QR state unavailable");
    }
  }

  async function read(key: string) {
    return await execute("return redis.call('GET', KEYS[1])", 1, key);
  }

  async function getRequest(requestId: string) {
    if (!WechatQrIdSchema.safeParse(requestId).success) return null;
    const raw = await execute(`${currentRequest}return raw`, 1, requestKey(requestId), browserPrefix, requestId);
    return raw === null ? null : requestSchema.parse(JSON.parse(String(raw)));
  }

  async function withWaitingRequest(requestId: string, key: string, value: object) {
    if (!WechatQrIdSchema.safeParse(requestId).success) return false;
    return (
      (await execute(
        `${waitingRequest}
        return redis.call('SET', KEYS[2], ARGV[3], 'PXAT', string.format('%.0f', request.expiresAt), 'NX')`,
        2,
        requestKey(requestId),
        key,
        browserPrefix,
        requestId,
        JSON.stringify(value),
      )) === "OK"
    );
  }

  async function finishBinding(
    binding: AuthorizedWechatQrBinding,
    owner: string,
    result: "release" | "restart" | "confirmed",
  ) {
    return (
      (await execute(
        `${currentBindingRequest}
         if not request.bindingOwner or request.bindingOwner.token ~= ARGV[5] then return nil end
         if ARGV[6] ~= 'release' then
           request.status = ARGV[6]
           if ARGV[6] == 'confirmed' then request.member = request.bindingOwner.member end
           request.wxId = nil
         end
         request.bindingOwner = nil
         return redis.call('SET', KEYS[1], cjson.encode(request), 'XX', 'KEEPTTL')`,
        1,
        requestKey(binding.requestId),
        browserPrefix,
        binding.requestId,
        browserKey(binding.browser),
        String(binding.expiresAt),
        owner,
        result,
      )) === "OK"
    );
  }

  return {
    async reserveBinding(binding: AuthorizedWechatQrBinding, member: RegisteredWechatQrMember) {
      const owner = newHandle();
      const result = await execute(
        `${currentBindingRequest}
         if request.bindingOwner or request.wxId ~= ARGV[5] then return nil end
         request.bindingOwner = cjson.decode(ARGV[6])
         return redis.call('SET', KEYS[1], cjson.encode(request), 'XX', 'KEEPTTL')`,
        1,
        requestKey(binding.requestId),
        browserPrefix,
        binding.requestId,
        browserKey(binding.browser),
        String(binding.expiresAt),
        binding.wxId,
        JSON.stringify({ token: owner, member }),
      );
      return result === "OK" ? owner : null;
    },
    finishBinding,

    async start(
      browser: WechatQrBrowser,
      continuationExpiresAt: number,
      presentation: { applicationName: string; device: string },
    ) {
      const requestId = newHandle();
      const browserDigest = browserKey(browser);
      const expiresAt = await execute(
        `${redisTime}
        local deadline = math.min(now + 300000, tonumber(ARGV[1]))
        if deadline <= now then return nil end
        local request = cjson.decode(ARGV[2])
        request.expiresAt = deadline
        local expiration = string.format('%.0f', deadline)
        local previous = redis.call('GET', KEYS[1])
        if not redis.call('SET', KEYS[2], cjson.encode(request), 'PXAT', expiration, 'NX') then
          return redis.error_reply('QR request identifier collision')
        end
        redis.call('SET', KEYS[1], ARGV[3], 'PXAT', ARGV[1])
        if previous then redis.call('DEL', ARGV[4] .. previous) end
        return deadline`,
        2,
        `${browserPrefix}${browserDigest}`,
        requestKey(requestId),
        String(continuationExpiresAt),
        JSON.stringify({ ...presentation, browser: browserDigest, status: "waiting" }),
        requestId,
        requestPrefix,
      );
      return expiresAt === null ? null : { requestId, expiresAt: z.number().int().parse(expiresAt) };
    },

    async readDesktop(browser: WechatQrBrowser, requestId: string) {
      const request = await getRequest(requestId);
      return request?.browser === browserKey(browser) ? request : null;
    },

    async claimDesktop(
      browser: WechatQrBrowser,
      requestId: string,
      member: RegisteredWechatQrMember,
      continuationExpiresAt: number,
    ) {
      const result = await execute(
        `${currentRequest}
        ${redisTime}
        if request.browser ~= ARGV[3] or request.status ~= 'confirmed' then return nil end
        if request.expiresAt <= now or tonumber(ARGV[6]) <= now then return nil end
        if request.member.userId ~= tonumber(ARGV[4]) or request.member.subjectIdentifier ~= ARGV[5] then return nil end
        request.status = 'consumed'
        request.member = nil
        return redis.call('SET', KEYS[1], cjson.encode(request), 'XX', 'KEEPTTL')`,
        1,
        requestKey(requestId),
        browserPrefix,
        requestId,
        browserKey(browser),
        String(member.userId),
        member.subjectIdentifier,
        String(continuationExpiresAt),
      );
      return result === "OK";
    },

    async startAuthorization(requestId: string) {
      const state = newHandle();
      const proof = newHandle();
      const saved = await withWaitingRequest(requestId, oauthKey(state), {
        requestId,
        browser: digest(proof),
      });
      return saved ? { state, proof } : null;
    },

    async consumeAuthorization(state: string, proof: string) {
      if (!WechatQrIdSchema.safeParse(state).success || !WechatQrIdSchema.safeParse(proof).success) return null;
      const raw = await execute(
        `local raw = redis.call('GET', KEYS[1])
         if not raw then return nil end
         local authorization = cjson.decode(raw)
         if authorization.browser ~= ARGV[1] then return nil end
         redis.call('DEL', KEYS[1])
         return raw`,
        1,
        oauthKey(state),
        digest(proof),
      );
      if (raw === null) return null;
      const { requestId } = mobileSchema.parse(JSON.parse(String(raw)));
      const request = await getRequest(requestId);
      return request?.status === "waiting" ? requestId : null;
    },

    async prepareConfirmation(requestId: string, wxId: string) {
      const flowId = newHandle();
      const proof = newHandle();
      const saved = await withWaitingRequest(requestId, confirmationKey(flowId), {
        requestId,
        wxId,
        browser: digest(proof),
      });
      return saved ? { flowId, proof } : null;
    },

    async readConfirmation(flowId: string, proof: string) {
      if (!WechatQrIdSchema.safeParse(flowId).success || !WechatQrIdSchema.safeParse(proof).success) return null;
      const raw = await read(confirmationKey(flowId));
      if (raw === null) return null;
      const confirmation = confirmationSchema.parse(JSON.parse(String(raw)));
      if (confirmation.browser !== digest(proof)) return null;
      const request = await getRequest(confirmation.requestId);
      if (request?.status !== "waiting") return null;
      return {
        requestId: confirmation.requestId,
        wxId: confirmation.wxId,
        applicationName: request.applicationName,
        device: request.device,
      };
    },

    async decide(
      flowId: string,
      proof: string,
      requestId: string,
      decision:
        | { status: "restart" }
        | { status: "confirmed"; member: RegisteredWechatQrMember }
        | { status: "binding_required"; wxId: string },
    ) {
      const result = await execute(
        `${waitingRequest}
        local raw = redis.call('GET', KEYS[2])
        if not raw then return nil end
        local confirmation = cjson.decode(raw)
        if confirmation.browser ~= ARGV[3] or confirmation.requestId ~= ARGV[2] then return nil end
        local decision = cjson.decode(ARGV[4])
        request.status = decision.status
        request.member = decision.member
        request.wxId = decision.wxId
        if not redis.call('SET', KEYS[1], cjson.encode(request), 'XX', 'KEEPTTL') then return nil end
        redis.call('DEL', KEYS[2])
        return 'OK'`,
        2,
        requestKey(requestId),
        confirmationKey(flowId),
        browserPrefix,
        requestId,
        digest(proof),
        JSON.stringify(decision),
      );
      return result === "OK";
    },
  };
}

export type WechatQrState = ReturnType<typeof createWechatQrState>;
