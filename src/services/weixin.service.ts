import { config } from '../config';
import { redis } from '../libs/cache/redis';

interface WeixinAccessTokenResponse {
  errcode: number;
  errmsg: string;
  access_token: string;
  expires_in: number;
}

export const weixinService = {
  async getWxAccessToken() {
    const cachedToken = await redis.get('wx_access_token');
    if (cachedToken !== null) {
      return cachedToken;
    }
    const res = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${config.WX_CORPID}&corpsecret=${config.WX_CORPSECRET}`,
      {
        method: 'POST',
      },
    );
    const body = await res.json() as WeixinAccessTokenResponse;
    if (body.errcode !== 0) {
      return null;
    }
    const accessToken = body.access_token;
    await redis.set('wx_access_token', accessToken, 'EX', 3600);
    return accessToken;
  },
};
