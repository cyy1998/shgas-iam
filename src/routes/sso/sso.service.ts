import type { AuthObject } from '@/schemas/authObject.type';
import type { UserDetailDto, UserDto } from '@/schemas/user.common.type';
import type { WeixinResponse } from '@/schemas/wx.type';
import axios from 'axios';
import { sleep } from 'bun';
import { sm3 } from 'sm-crypto';
import { config } from '@/config';
import { AuthzUnauthorizedError } from '@/errors/AuthzUnauthorizedError';
import { CustomError } from '@/errors/CustomError';
import { redis } from '@/lib/clients/redis';
import { UserDetailDtoSchema } from '@/schemas/user.common.type';
import { clientService } from '@/services/client.service';
import { sessionService } from '@/services/session.service';
import { userService } from '@/services/user.common.service';
import { weixinService } from '@/services/weixin.service';

async function _wxRetry(code: string, retryTimes: number = 0, maxTimes: number = 5) {
  if (retryTimes > maxTimes) {
    await redis.del(`wx-code:${code}`);
    throw new CustomError('微信登录超时');
  }
  await sleep(200);
  const codeCache = await redis.get(`wx-code:${code}`);
  if (codeCache === null) {
    throw new CustomError('微信登录超时');
  }
  if (codeCache === 'Processing') {
    return _wxRetry(code, retryTimes + 1);
  }
  const userDetailDto = UserDetailDtoSchema.parse(JSON.parse(codeCache));
  const token = await sessionService.setGlobalSession(userDetailDto);
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

async function _orcasLogin(userDto: UserDto) {
  const orcasUri = config.ORCAS_URL;
  const resp = await axios(orcasUri, {
    method: 'POST',
    data: {
      id: userDto.id,
      username: userDto.username,
      name: userDto.name,
      mobile: userDto.mobile ?? '',
    },
  });
  if (resp.status !== 200 || resp.data.code !== 200 || !resp.headers['set-cookie']) {
    throw new CustomError('Orcas登录失败');
  }
  const cookieStr = resp.headers['set-cookie'][1] ?? '';
  const match = cookieStr.match(/orcas_sso_sessionid=([^;]+)/);
  const orcasSessionId = match ? match[1] : null;
  if (!orcasSessionId) {
    throw new CustomError('Orcas登录失败');
  }
  return {
    orcasSessionId,
    orcasId: resp.data.data.id,
  };
}

export async function callback(code: string, clientCode: string, redirectUrl: string) {
  const client = await clientService.getClientByCode(clientCode);
  if (client === null) {
    throw new CustomError('非法client代码');
  }
  if (!client.extAttributes.validRedirectUrls.some(u => redirectUrl.startsWith(u))) {
    throw new CustomError('非法重定向地址');
  }
  const authObjectString = await redis.get(`auth_code:${code}`);
  if (authObjectString === null) {
    throw new AuthzUnauthorizedError('非法code');
  }
  const authObject: AuthObject = JSON.parse(authObjectString);
  const userString = authObject.data;
  const globalSessionId = authObject.sessionId;

  const user: UserDetailDto = JSON.parse(userString);

  if (!globalSessionId) {
    throw new AuthzUnauthorizedError('全局session不存在');
  }
  const ttl = await redis.ttl(`global_session:${globalSessionId}`);
  const localSessionId = crypto.randomUUID();
  let globalOrcasSessionId = null;
  if (client.extAttributes.requireOrcas === true) {
    const { orcasSessionId, orcasId } = await _orcasLogin(user);
    globalOrcasSessionId = orcasSessionId;
    user.orcasId = orcasId;
  }
  await Promise.all([
    redis.set(`local_${clientCode}_session:${localSessionId}`, JSON.stringify(user), 'EX', ttl),
    redis.del(`auth_code:${code}`),
    sessionService.setLocalSession(`local_session_set:${globalSessionId}`, `local_${clientCode}_session:${localSessionId}`, ttl),
    redis.expire(`local_session_set:${globalSessionId}`, config.REDIS_EXPIRE_TIME),
  ]);
  return {
    orcasSessionId: globalOrcasSessionId,
    token: localSessionId,
  };
}

export async function setToken(code: string, clientCode: string, clientSecret: string) {
  const client = await clientService.getClientByCode(clientCode);
  if (client === null || clientSecret !== client.extAttributes.clientSecret) {
    throw new CustomError('非法Client');
  }
  const sid = crypto.randomUUID();
  const authStr = await redis.get(`auth_code:${code}`);
  if (authStr === null) {
    throw new CustomError('非法Code');
  }
  const userInfo = JSON.parse(authStr).data;
  const globalSessionId = JSON.parse(authStr).sessionId;
  const ttl = await redis.ttl(`global_session:${globalSessionId}`);
  await Promise.all([
    redis.del(`auth_code:${code}`),
    sessionService.setLocalSession(`local_session_set:${globalSessionId}`, `local_${clientCode}_session:${sid}`, ttl),
    redis.expire(`local_session_set:${globalSessionId}`, config.REDIS_EXPIRE_TIME),
    // redis.lpush(`local_session_set:${globalSessionId}`, `local_${clientCode}_session:${localSessionId}`)
  ]);
  return {
    sid,
    ttl,
    userInfo,
  };
}

export async function authorize(globalSessionId: string | undefined, clientCode: string, redirectUrl: string) {
  const client = await clientService.getClientByCode(clientCode);
  if (client === null) {
    throw new CustomError('非法client代码');
  }
  if (!client.extAttributes.validRedirectUrls.some(u => redirectUrl.startsWith(u))) {
    throw new CustomError('非法重定向地址');
  }
  const userString = await redis.get(`global_session:${globalSessionId}`);
  if (!userString || !globalSessionId) {
    return {
      isLogin: false,
      code: null,
    };
  }
  const code = crypto.randomUUID();
  await Promise.all([
    redis.expire(`global_session:${globalSessionId}`, config.REDIS_EXPIRE_TIME),
    redis.set(`auth_code:${code}`, JSON.stringify(
      {
        sessionId: globalSessionId,
        data: userString,
      },
    ), 'EX', config.AUTH_CODE_EXPIRE_TIME),
    // redis.set(`global_session_for_code:${code}`, globalSessionId, 'EX', env.AUTH_CODE_EXPIRE_TIME)
  ]);
  return {
    isLogin: true,
    code,
  };
}

export async function logout(globalSessionId: string | null) {
  const existSession = await redis.exists(`global_session:${globalSessionId}`);
  if (existSession === 0) {
    return true;
  }
  const localSessionSet = await sessionService.getValidLocalSessions(`local_session_set:${globalSessionId}`);
  await Promise.all(localSessionSet.map(s => redis.del(s)));
  await Promise.all([
    redis.del(`global_session:${globalSessionId}`),
    redis.del(`local_session_set:${globalSessionId}`),
  ]);
  return true;
}

export async function loginOA(loginid: string, ts: string, token: string) {
  const currentTimestamp = Date.now();
  if (config.NODE_ENV === 'production' && Math.abs(currentTimestamp - Number.parseInt(ts)) >= 1000 * 300) {
    throw new AuthzUnauthorizedError('token过期');
  }
  const hashSting = Buffer.from(sm3(`${loginid}|${ts}|${config.IAM_SECRET_KEY}${config.IAM_SECRET_KEY}`), 'hex').toBase64();
  if (hashSting !== token) {
    throw new AuthzUnauthorizedError('token校验失败');
  }
  const userDetailDto = await userService.getUserDetailByUsername(loginid);
  if (userDetailDto.userType !== '正式员工') {
    throw new CustomError('用户类别不支持OA登录');
  }
  const sessionId = await sessionService.setGlobalSession(userDetailDto);
  return { token: sessionId, isMobileSet: userDetailDto.mobile !== null };
}

export async function loginWX(code: string) {
  const codeCache = await redis.get(`wx-code:${code}`);
  if (codeCache !== null) {
    return _wxRetry(code);
  }
  await redis.set(`wx-code:${code}`, 'Processing', 'EX', 600);
  const accessToken = await weixinService.getWxAccessToken();
  if (!accessToken) {
    redis.del(`wx-code:${code}`);
    throw new Error('网络错误，AccessToken获取失败');
  }
  const resp = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${code}`,
    {
      method: 'POST',
    },
  );
  const body = await resp.json() as WeixinResponse;
  const wxId = body.userid;
  const userDetailDto = await userService.getUserDetailByWxId(wxId);
  const token = await sessionService.setGlobalSession(userDetailDto);
  await redis.set(`wx-code:${code}`, JSON.stringify(userDetailDto), 'EX', 600);
  return { token, isMobileSet: userDetailDto.mobile !== null };
}
