import type { RedisPort } from "@api/composition/runtime";
import { z } from "@hono/zod-openapi";

const WechatAccessTokenResponseSchema = z.object({
  errcode: z.number(),
  errmsg: z.string(),
  access_token: z.string(),
  expires_in: z.number(),
}).openapi("WechatAccessTokenResponseSchema");

const WechatUserInfoResponseSchema = z.object({
  errcode: z.number(),
  errmsg: z.string(),
  userid: z.string(),
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

  async function getWxAccessToken() {
    const cachedToken = await deps.redis.get("wx_access_token");
    if (cachedToken !== null) {
      return cachedToken;
    }
    const res = await fetchFn(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${deps.config.corpId}&corpsecret=${deps.config.corpSecret}`,
      {
        method: "POST",
      },
    );
    const body = WechatAccessTokenResponseSchema.parse(await res.json());
    if (body.errcode !== 0) {
      return null;
    }
    const accessToken = body.access_token;
    await deps.redis.set("wx_access_token", accessToken, "EX", 3600);
    return accessToken;
  }

  async function getWxUserId(code: string) {
    const accessToken = await getWxAccessToken();
    const resp = await fetchFn(
      `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${code}`,
      {
        method: "POST",
      },
    );
    const body = WechatUserInfoResponseSchema.parse(await resp.json());
    return body.userid;
  }

  return {
    getWxAccessToken,
    getWxUserId,
  };
}

export type WechatClient = ReturnType<typeof createWechatClient>;
