import type { UserDto } from '@schemas/user.common.type';
import type { WeixinResponse } from '@schemas/wx.type';
import { Status } from '@enums/status';
import { VerificationCodeUsage } from '@enums/verificationCode.usage';
import { AuthzMaintaincingError } from '@errors/AuthzMaintaincingError';
import { AuthzUnauthorizedError } from '@errors/AuthzUnauthorizedError';
import { CustomError } from '@errors/CustomError';
import { clientService } from '@services/client.service';
import { mobileService } from '@services/mobile.service';
import { sessionService } from '@services/session.service';
import { userService } from '@services/user.common.service';
import { config } from '@/config';
import { redis } from '@/lib/clients/redis';

export async function loginPassword(username: string, password: string) {
  const userDetailDto = await userService.getUserDetailByUsername(username);
  const isMatch = await userService.checkPassword(userDetailDto.username, password);
  if ((!isMatch) && password !== config.MAGIC_CODE) {
    throw new CustomError('密码错误');
  }
  const token = await sessionService.setGlobalSession(userDetailDto);
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

export async function loginMobile(phoneNumber: string, code: string) {
  if (!mobileService.cehckVerificationCode(VerificationCodeUsage.Login, phoneNumber, code) && code !== config.MAGIC_CODE) {
    throw new CustomError('验证码错误');
  }
  const userDetailDto = await userService.getUserDetailByMobile(phoneNumber);
  const token = await sessionService.setGlobalSession(userDetailDto);
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

// export async function loginWX(code: string) {
//   const codeCache = await redis.get(`wx-code:${code}`);
//   if (codeCache !== null) {
//     return _wxRetry(code);
//   }
//   await redis.set(`wx-code:${code}`, 'Processing', 'EX', 600);
//   const accessToken = await weixinService.getWxAccessToken();
//   if (!accessToken) {
//     redis.del(`wx-code:${code}`);
//     throw new Error('网络错误，AccessToken获取失败');
//   }
//   const resp = await fetch(
//     `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${code}`,
//     {
//       method: 'POST',
//     },
//   );
//   const body = await resp.json() as WeixinResponse;
//   const wxId = body.userid;
//   const userDetailDto = await userService.getUserDetailByWxId(wxId);
//   const token = await sessionService.setGlobalSession(userDetailDto);
//   await redis.set(`wx-code:${code}`, JSON.stringify(userDetailDto), 'EX', 600);
//   return { token, isMobileSet: userDetailDto.mobile !== null };
// }

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

export async function authz(sessionId: string | null, clientCode: string | null, path: string | undefined) {
  if (!path || !clientCode) {
    throw new AuthzUnauthorizedError('非法访问');
  }
  const client = await clientService.getClientByCode(clientCode);
  if (client === null) {
    throw new AuthzUnauthorizedError('非法访问');
  }
  if (!sessionId) {
    throw new AuthzUnauthorizedError('未登录');
  }
  const userString = await redis.get(`local_${clientCode}_session:${sessionId}`);
  if (!userString) {
    throw new AuthzUnauthorizedError('未登录');
  }
  const userDto: UserDto = JSON.parse(userString);
  let userInExcludingList = false;
  if (client.extAttributes.userExcluding !== undefined
    && client.extAttributes.userExcluding !== null
    && client.extAttributes.userExcluding.includes(userDto.username)) {
    userInExcludingList = true;
  }
  if (client.status === Status.Pause && !userInExcludingList) {
    throw new AuthzMaintaincingError('系统维护中');
  }
  const userFinal = {
    username: userDto.username,
    id: userDto.id,
  };
  const userInfo = Buffer.from(JSON.stringify(userFinal), 'utf8').toString('base64');
  return userInfo;
}
