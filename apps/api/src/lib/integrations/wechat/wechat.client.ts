import { createHash } from "node:crypto";
import type { RedisPort } from "@api/composition/runtime";
import { type WechatQrIdentity, wechatOpenIdSchema } from "@api/services/authentication/wechat-qr-identity.type";
import { z } from "zod";

const tokenResponse = z.object({
  errcode: z.literal(0),
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
const memberResponse = z.object({ errcode: z.literal(0), userid: z.string().trim().min(1).max(255) });
const externalIdentityResponse = z.object({
  errcode: z.literal(0),
  userid: z.never().optional(),
  openid: wechatOpenIdSchema,
});

export interface CreateWechatClientDeps {
  redis: Pick<RedisPort, "get" | "set">;
  config: {
    corpId: string;
    corpSecret: string;
  };
  fetch?: typeof fetch;
}

export function createWechatClient(deps: CreateWechatClientDeps) {
  const fetchFn = deps.fetch ?? fetch;
  const { corpId, corpSecret } = deps.config;
  const credentialDigest = createHash("sha256")
    .update(JSON.stringify([corpId, corpSecret]))
    .digest("hex");
  const cacheKey = `wechat:app-access-token:${credentialDigest}`;

  async function getJson(path: string, parameters: Record<string, string>): Promise<unknown> {
    const url = new URL(path, "https://qyapi.weixin.qq.com");
    url.search = new URLSearchParams(parameters).toString();
    try {
      const response = await fetchFn(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      // The URL contains provider credentials. Never propagate transport error details.
      throw new Error("WeChat provider request failed");
    }
  }

  async function getWxAccessToken() {
    const cachedToken = await deps.redis.get(cacheKey);
    if (cachedToken !== null) return cachedToken;
    const token = tokenResponse.safeParse(
      await getJson("/cgi-bin/gettoken", { corpid: corpId, corpsecret: corpSecret }),
    );
    if (!token.success) throw new Error("WeChat application credential unavailable");
    const { access_token, expires_in } = token.data;
    // Cache for at most an hour and expire before the provider's deadline.
    if (expires_in > 60) await deps.redis.set(cacheKey, access_token, "EX", Math.min(3600, expires_in - 60));
    return access_token;
  }

  async function getIdentityResponse(code: string) {
    const accessToken = await getWxAccessToken();
    return await getJson("/cgi-bin/auth/getuserinfo", { access_token: accessToken, code });
  }

  async function getWxUserId(code: string) {
    const member = memberResponse.safeParse(await getIdentityResponse(code));
    if (!member.success) throw new Error("WeChat member identity unavailable");
    return member.data.userid;
  }

  async function getQrIdentity(code: string): Promise<WechatQrIdentity> {
    const response = await getIdentityResponse(code);
    const member = memberResponse.safeParse(response);
    if (member.success) return { kind: "member", wxId: member.data.userid };
    const external = externalIdentityResponse.safeParse(response);
    if (external.success) return { kind: "external", corpId, openId: external.data.openid };
    throw new Error("WeChat QR identity unavailable");
  }

  return { getWxAccessToken, getWxUserId, getQrIdentity };
}

export type WechatClient = ReturnType<typeof createWechatClient>;
