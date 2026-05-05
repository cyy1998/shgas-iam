import config from "@api/env";
import redis from "@api/lib/clients/redis";
import { createSingleton } from "@api/lib/core/singleton";
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

function createWechatClient() {
  return {
    async getWxAccessToken() {
      const cachedToken = await redis.get("wx_access_token");
      if (cachedToken !== null) {
        return cachedToken;
      }
      const res = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${config.WX_CORPID}&corpsecret=${config.WX_CORPSECRET}`,
        {
          method: "POST",
        },
      );
      const body = WechatAccessTokenResponseSchema.parse(await res.json());
      if (body.errcode !== 0) {
        return null;
      }
      const accessToken = body.access_token;
      await redis.set("wx_access_token", accessToken, "EX", 3600);
      return accessToken;
    },
    async getWxUserId(code: string) {
      const accessToken = await this.getWxAccessToken();
      const resp = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${code}`,
        {
          method: "POST",
        },
      );
      const body = WechatUserInfoResponseSchema.parse(await resp.json());
      return body.userid;
    },
  };
}

const wechatClient = createSingleton(
  "wechat",
  createWechatClient,
);

export default wechatClient;
