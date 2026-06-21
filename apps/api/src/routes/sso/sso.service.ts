import type { CustomSsoPrincipalTokenSource, SsoServiceDeps } from "./sso.port";
import { buildOaLoginSuccessAudit, buildWechatLoginSuccessAudit } from "@api/services/audit/events/auth.audit";
import { UserDetailDtoSchema } from "@api/services/user/user.schema";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
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
    const authCode = await deps.customSsoSession.consumeAuthCode({
      code,
      clientCode,
      redirectUrl,
      invalidCodeError: "unauthorized",
    });
    const userDetailDto = { ...authCode.userDetail };
    let globalOrcasSessionId = null;
    if (client.extAttributes.requireOrcas === true) {
      const { orcasSessionId, orcasId } = await deps.orcasClient.orcasLogin(userDetailDto);
      globalOrcasSessionId = orcasSessionId;
      userDetailDto.orcasId = orcasId;
    }
    const { token } = await deps.customSsoSession.createLocalSession({
      authCode,
      client,
      mode: ClientManagementLevel.Gateway,
      userDetail: userDetailDto,
      orcasSessionId: globalOrcasSessionId,
    });
    return {
      orcasSessionId: globalOrcasSessionId,
      token,
    };
  }

  async function setToken(code: string, clientCode: string, clientSecret: string) {
    const client = await deps.clientService.getClientByCode(clientCode);
    if (client === null || clientSecret !== client.clientSecret) {
      throw new InvalidSsoClientError("非法Client");
    }
    const authCode = await deps.customSsoSession.consumeAuthCode({
      code,
      clientCode,
      invalidCodeError: "invalid_auth_code",
    });
    const { token, ttl, userInfo } = await deps.customSsoSession.createLocalSession({
      authCode,
      client,
      mode: ClientManagementLevel.Independent,
      userDetail: authCode.userDetail,
    });
    return { sid: token, ttl, userInfo };
  }

  async function authorize(
    globalSessionToken: string | undefined,
    tokenSource: CustomSsoPrincipalTokenSource,
    clientCode: string,
    redirectUrl: string,
  ) {
    const client = await deps.clientService.getClientByCode(clientCode);
    if (client === null) {
      throw new InvalidSsoClientError("非法client代码");
    }
    if (!isRedirectUrlAllowed(clientCode, redirectUrl, client.extAttributes.validRedirectUrls)) {
      throw new InvalidRedirectUriError("非法重定向地址");
    }
    return await deps.customSsoSession.authorize({
      token: globalSessionToken,
      tokenSource,
      clientCode,
      redirectUrl,
    });
  }

  async function logout(sessionToken: string | undefined) {
    await deps.customSsoSession.logout(sessionToken);
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
    const { token: sessionId } = await deps.customSsoSession.createPrincipalSession(userDetailDto, { amr: ["oa"] });
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
    const { token } = await deps.customSsoSession.createPrincipalSession(userDetailDto, { amr: ["wechat"] });
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
    const { token } = await deps.customSsoSession.createPrincipalSession(userDetailDto, { amr: ["wechat"] });
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
