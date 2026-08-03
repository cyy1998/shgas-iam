import type { LoginWithWechatDeps } from "./login-with-wechat.port";
import type { LoginWithWechatInput, LoginWithWechatOptions } from "./login-with-wechat.type";
import { buildWechatLoginSuccessAudit } from "@api/services/audit/events/auth.audit";
import { toSessionOrigin } from "@api/services/session/session-origin";
import { LoginFailedError } from "@iam/api-core/errors/LoginFailedError";
import { reviveIsoDates } from "@iam/api-core/utils";
import { UserDetailDtoSchema } from "@iam/domain/user";
import { z } from "zod";

const CachedWechatLoginUserSchema = z.union([
  z.object({ userId: z.number().int().positive() }),
  UserDetailDtoSchema.pick({ id: true }).transform(value => ({ userId: value.id })),
]);

export function createLoginWithWechatUseCase(deps: LoginWithWechatDeps) {
  async function retry(
    code: string,
    requestContext: LoginWithWechatOptions["requestContext"],
    retryTimes: number = 0,
    maxTimes: number = 5,
  ): Promise<{
    token: string;
    isMobileSet: boolean;
  }> {
    if (retryTimes > maxTimes) {
      await deps.cache.del(`wx-code:${code}`);
      throw new LoginFailedError("微信登录超时");
    }
    await deps.delay.wait(200);
    const codeCache = await deps.cache.get(`wx-code:${code}`);
    if (codeCache === null) {
      throw new LoginFailedError("微信登录超时");
    }
    if (codeCache === "Processing") {
      return retry(code, requestContext, retryTimes + 1, maxTimes);
    }
    const { userId } = CachedWechatLoginUserSchema.parse(JSON.parse(codeCache, reviveIsoDates));
    const liveUser = await deps.users.getActiveUserById(userId);
    if (liveUser === null) {
      throw new LoginFailedError("用户不存在");
    }
    const userDetail = await deps.users.getUserDetailById(liveUser.id);
    const { token } = await deps.principalSessions.createPrincipalSession(liveUser.subjectIdentifier, {
      amr: ["wechat"],
      origin: toSessionOrigin(requestContext),
    });
    return { token, isMobileSet: userDetail.mobile !== null };
  }

  async function execute(input: LoginWithWechatInput, options: LoginWithWechatOptions = {}) {
    const codeCached = await deps.cache.get(`wx-code:${input.code}`);
    if (codeCached !== null) {
      return retry(input.code, options.requestContext);
    }
    await deps.cache.set(`wx-code:${input.code}`, "Processing", "EX", 600);
    const wxId = await deps.wechat.getWxUserId(input.code);
    const liveUser = await deps.users.getActiveUserByWxId(wxId);
    if (liveUser === null) {
      throw new LoginFailedError("用户不存在");
    }
    const userDetail = await deps.users.getUserDetailById(liveUser.id);
    const { token } = await deps.principalSessions.createPrincipalSession(liveUser.subjectIdentifier, {
      amr: ["wechat"],
      origin: toSessionOrigin(options.requestContext),
    });
    await deps.auditLogWriter.recordAuditLog({
      ...options.requestContext,
      ...buildWechatLoginSuccessAudit(userDetail),
    });
    await deps.cache.set(`wx-code:${input.code}`, JSON.stringify({ userId: liveUser.id }), "EX", 600);
    return { token, isMobileSet: userDetail.mobile !== null };
  }

  return { execute };
}

export type LoginWithWechatUseCase = ReturnType<typeof createLoginWithWechatUseCase>;
