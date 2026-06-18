import type { SsoServiceDeps } from "./sso.port";
import { buildOaLoginSuccessAudit, buildWechatLoginSuccessAudit } from "@api/services/audit/events/auth.audit";
import { SessionObjectSchema } from "@api/services/session/session.schema";
import { UserDetailDtoSchema } from "@api/services/user/user.schema";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { InvalidRedirectUriError } from "@iam/api-core/errors/InvalidRedirectUriError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import { LoginFailedError } from "@iam/api-core/errors/LoginFailedError";
import { SystemLogEvent } from "@iam/api-core/logger";
import { reviveIsoDates } from "@iam/api-core/utils";
import { ClientManagementLevel } from "@iam/contracts";
import { matchRedirectUrlPattern } from "@iam/domain/client";
import { sleep } from "bun";
import { sm3 } from "sm-crypto";

function hasSupportedRedirectUrlSyntax(redirectUrl: string) {
  try {
    const url = new URL(redirectUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  }
  catch {
    return false;
  }
}

export function createSsoService(deps: SsoServiceDeps) {
  async function consumeAuthCode(code: string) {
    const authObjectString = await deps.redis.getdel(`auth_code:${code}`);
    if (authObjectString === null) {
      return null;
    }
    return SessionObjectSchema.parse(JSON.parse(authObjectString, reviveIsoDates));
  }

  function isRedirectUrlAllowed(clientCode: string, redirectUrl: string, patterns: string[]) {
    if (!hasSupportedRedirectUrlSyntax(redirectUrl)) {
      return false;
    }

    for (const pattern of patterns) {
      try {
        if (matchRedirectUrlPattern(redirectUrl, pattern)) {
          return true;
        }
      }
      catch (err) {
        deps.logger.warn({ event: SystemLogEvent.RedirectPatternInvalid, err, clientCode, pattern }, "invalid client redirect url pattern");
      }
    }

    return false;
  }

  async function callback(code: string, clientCode: string, redirectUrl: string) {
    const client = await deps.clientService.getClientByCode(clientCode);
    if (client === null) {
      throw new InvalidSsoClientError("非法client代码");
    }
    if (!isRedirectUrlAllowed(clientCode, redirectUrl, client.extAttributes.validRedirectUrls)) {
      throw new InvalidRedirectUriError("非法重定向地址");
    }
    const authObject = await consumeAuthCode(code);
    if (authObject === null) {
      throw new AuthzUnauthorizedError("非法code");
    }
    const userString = authObject.data;
    const globalSessionId = authObject.sessionId;
    const userDetailDto = UserDetailDtoSchema.parse(JSON.parse(userString, reviveIsoDates));
    if (!globalSessionId) {
      throw new AuthzUnauthorizedError("全局session不存在");
    }
    let globalOrcasSessionId = null;
    if (client.extAttributes.requireOrcas === true) {
      const { orcasSessionId, orcasId } = await deps.orcasClient.orcasLogin(userDetailDto);
      globalOrcasSessionId = orcasSessionId;
      userDetailDto.orcasId = orcasId;
    }
    const { localSessionId } = await deps.sessionService.setLocalSession(
      globalSessionId,
      clientCode,
      userDetailDto,
      ClientManagementLevel.Gateway,
    );
    return {
      orcasSessionId: globalOrcasSessionId,
      token: localSessionId,
    };
  }

  async function setToken(code: string, clientCode: string, clientSecret: string) {
    const client = await deps.clientService.getClientByCode(clientCode);
    if (client === null || clientSecret !== client.clientSecret) {
      throw new InvalidSsoClientError("非法Client");
    }
    const authObject = await consumeAuthCode(code);
    if (authObject === null) {
      throw new InvalidAuthCodeError("非法Code");
    }
    const userString = authObject.data;
    const globalSessionId = authObject.sessionId;
    const userDetailDto = UserDetailDtoSchema.parse(JSON.parse(userString, reviveIsoDates));
    const { localSessionId, ttl } = await deps.sessionService.setLocalSession(
      globalSessionId,
      clientCode,
      userDetailDto,
      ClientManagementLevel.Independent,
    );
    return { sid: localSessionId, ttl, userInfo: userDetailDto };
  }

  async function authorize(globalSessionId: string | undefined, clientCode: string, redirectUrl: string) {
    const client = await deps.clientService.getClientByCode(clientCode);
    if (client === null) {
      throw new InvalidSsoClientError("非法client代码");
    }
    if (!isRedirectUrlAllowed(clientCode, redirectUrl, client.extAttributes.validRedirectUrls)) {
      throw new InvalidRedirectUriError("非法重定向地址");
    }
    if (!globalSessionId) {
      return {
        isLogin: false,
        code: null,
      };
    }
    const globalSession = await deps.sessionService.getGlobalSession(globalSessionId);
    if (globalSession === null) {
      return {
        isLogin: false,
        code: null,
      };
    }
    const code = deps.random.uuid();
    await Promise.all([
      deps.sessionService.renewGlobalSession(globalSessionId),
      deps.redis.set(`auth_code:${code}`, JSON.stringify(
        {
          sessionId: globalSessionId,
          data: JSON.stringify(globalSession.user),
        },
      ), "EX", deps.config.authCodeExpireSeconds),
    ]);
    return {
      isLogin: true,
      code,
    };
  }

  async function logout(globalSessionId: string) {
    if (await deps.sessionService.getGlobalSession(globalSessionId) === null)
      return true;
    const localSessionSet = await deps.sessionService.getValidLocalSessions(globalSessionId);
    await Promise.all(localSessionSet.map(e => deps.sessionService.removeLocalSession(e, globalSessionId)));
    await deps.sessionService.removeGlobalSession(globalSessionId);
    return true;
  }

  async function loginOA(clientCode: string, loginid: string, ts: string, token: string) {
    const client = await deps.clientService.getClientByCode(clientCode);
    if (client === null) {
      throw new InvalidSsoClientError("非法client代码");
    }
    const currentTimestamp = deps.clock.now();
    if (deps.config.nodeEnv === "production" && Math.abs(currentTimestamp - Number.parseInt(ts)) >= 1000 * 300) {
      throw new AuthzUnauthorizedError("token过期");
    }
    const hashSting = Buffer.from(sm3(`${loginid}|${ts}|${client.clientSecret}${client.clientSecret}`), "hex").toBase64();
    if (hashSting !== token) {
      throw new AuthzUnauthorizedError("token校验失败");
    }
    const userDetailDto = await deps.userService.getUserDetailByUsername(loginid);
    if (userDetailDto.userType !== "正式员工") {
      throw new LoginFailedError("用户类别不支持OA登录");
    }
    const sessionId = await deps.sessionService.setGlobalSession(userDetailDto);
    await deps.auditLogWriter.recordAuditLog(buildOaLoginSuccessAudit(userDetailDto, clientCode));
    return { token: sessionId, isMobileSet: userDetailDto.mobile !== null };
  }

  async function wxRetry(code: string, retryTimes: number = 0, maxTimes: number = 5): Promise<{
    token: string;
    isMobileSet: boolean;
  }> {
    if (retryTimes > maxTimes) {
      await deps.redis.del(`wx-code:${code}`);
      throw new LoginFailedError("微信登录超时");
    }
    await sleep(200);
    const codeCache = await deps.redis.get(`wx-code:${code}`);
    if (codeCache === null) {
      throw new LoginFailedError("微信登录超时");
    }
    if (codeCache === "Processing") {
      return wxRetry(code, retryTimes + 1);
    }
    const userDetailDto = UserDetailDtoSchema.parse(JSON.parse(codeCache, reviveIsoDates));
    const token = await deps.sessionService.setGlobalSession(userDetailDto);
    return { token, isMobileSet: userDetailDto.mobile !== null };
  }

  async function loginWX(code: string) {
    const codeCached = await deps.redis.get(`wx-code:${code}`);
    if (codeCached !== null) {
      return wxRetry(code);
    }
    await deps.redis.set(`wx-code:${code}`, "Processing", "EX", 600);
    const wxId = await deps.wechatClient.getWxUserId(code);
    const userDetailDto = await deps.userService.getUserDetailByWxId(wxId);
    const token = await deps.sessionService.setGlobalSession(userDetailDto);
    await deps.auditLogWriter.recordAuditLog(buildWechatLoginSuccessAudit(userDetailDto));
    await deps.redis.set(`wx-code:${code}`, JSON.stringify(userDetailDto), "EX", 600);
    return { token, isMobileSet: userDetailDto.mobile !== null };
  }

  return {
    callback,
    setToken,
    authorize,
    logout,
    loginOA,
    loginWX,
  };
}

export type SsoService = ReturnType<typeof createSsoService>;
