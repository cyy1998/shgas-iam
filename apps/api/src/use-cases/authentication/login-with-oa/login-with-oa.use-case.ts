import type { LoginWithOaDeps } from "./login-with-oa.port";
import type { LoginWithOaInput, LoginWithOaOptions } from "./login-with-oa.type";
import { buildOaLoginSuccessAudit } from "@api/services/audit/events/auth.audit";
import { toSessionOrigin } from "@api/services/session/session-origin";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { InvalidSsoClientError } from "@iam/api-core/errors/InvalidSsoClientError";
import { LoginFailedError } from "@iam/api-core/errors/LoginFailedError";
import { UserType } from "@iam/contracts";
import { sm3 } from "sm-crypto";

export function createLoginWithOaUseCase(deps: LoginWithOaDeps) {
  async function execute(input: LoginWithOaInput, options: LoginWithOaOptions = {}) {
    const client = await deps.clients.getClientByCode(input.clientCode);
    if (client === null) {
      throw new InvalidSsoClientError("非法client代码");
    }
    const currentTimestamp = deps.clock.now();
    if (deps.config.nodeEnv === "production"
      && Math.abs(currentTimestamp - Number.parseInt(input.timestamp)) >= 1000 * 300) {
      throw new AuthzUnauthorizedError("token过期");
    }
    const hashString = Buffer.from(
      sm3(`${input.loginId}|${input.timestamp}|${client.clientSecret}${client.clientSecret}`),
      "hex",
    ).toBase64();
    if (hashString !== input.token) {
      throw new AuthzUnauthorizedError("token校验失败");
    }
    const liveUser = await deps.users.getActiveUserByUsername(input.loginId);
    if (liveUser === null) {
      throw new LoginFailedError("用户不存在");
    }
    if (liveUser.userType !== UserType.Formal) {
      throw new LoginFailedError("用户类别不支持OA登录");
    }
    const userDetail = await deps.users.getUserDetailById(liveUser.id);
    const { token: sessionId } = await deps.principalSessions.createPrincipalSession(liveUser.subjectIdentifier, {
      amr: ["oa"],
      origin: toSessionOrigin(options.requestContext),
    });
    await deps.auditLogWriter.recordAuditLog({
      ...options.requestContext,
      ...buildOaLoginSuccessAudit(userDetail, input.clientCode),
    });
    return { token: sessionId, isMobileSet: userDetail.mobile !== null };
  }

  return { execute };
}

export type LoginWithOaUseCase = ReturnType<typeof createLoginWithOaUseCase>;
