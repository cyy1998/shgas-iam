import type { AuthObject } from '@/schemas/authObject.type';
import { sleep } from 'bun';
import { sm3 } from 'sm-crypto';
import config from '@/env';
import { AuthzUnauthorizedError } from '@/errors/AuthzUnauthorizedError';
import { CustomError } from '@/errors/CustomError';
import orcasClient from '@/lib/clients/orcas';
import redis from '@/lib/clients/redis';
import wechatClient from '@/lib/clients/wechat';
import { UserDetailDtoSchema } from '@/schemas/user.common.type';
import * as clientService from '@/services/client/client.service';
import { sessionService } from '@/services/session.service';
import { userService } from '@/services/user.common.service';

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

  const userDetailDto = UserDetailDtoSchema.parse(JSON.parse(userString));

  if (!globalSessionId) {
    throw new AuthzUnauthorizedError('全局session不存在');
  }
  const ttl = await redis.ttl(`global_session:${globalSessionId}`);
  const localSessionId = crypto.randomUUID();
  let globalOrcasSessionId = null;
  if (client.extAttributes.requireOrcas === true) {
    const { orcasSessionId, orcasId } = await orcasClient.orcasLogin(userDetailDto);
    globalOrcasSessionId = orcasSessionId;
    userDetailDto.orcasId = orcasId;
  }
  await Promise.all([
    redis.set(`local_${clientCode}_session:${localSessionId}`, JSON.stringify(userDetailDto), 'EX', ttl),
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
  ]);
  return { sid, ttl, userInfo };
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

export async function loginWX(code: string) {
  const codeCached = await redis.get(`wx-code:${code}`);
  if (codeCached !== null) {
    return _wxRetry(code);
  }
  await redis.set(`wx-code:${code}`, 'Processing', 'EX', 600);
  const wxId = await wechatClient.getWxUserId(code);
  const userDetailDto = await userService.getUserDetailByWxId(wxId);
  const token = await sessionService.setGlobalSession(userDetailDto);
  await redis.set(`wx-code:${code}`, JSON.stringify(userDetailDto), 'EX', 600);
  return { token, isMobileSet: userDetailDto.mobile !== null };
}
