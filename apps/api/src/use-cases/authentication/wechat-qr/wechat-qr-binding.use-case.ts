import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import type { ApiRequestContext } from "@api/services/audit/audit.context";
import { buildWechatBindingAudit } from "@api/services/audit/events/auth.audit";
import type { AuthorizedWechatQrBinding } from "@api/services/authentication/wechat-qr.state";
import {
  createHumanVerificationContext,
  type HumanVerificationContext,
} from "@api/services/human-verification/human-verification.type";
import { ApiErrorCode } from "@iam/contracts";
import { SERVICE_UNAVAILABLE } from "@iam/contracts/http";
import { CustomError } from "@iam/runtime/errors";
import { consumeTransactionRollbackConfirmation } from "@iam/unit-of-work";
import { LoginFailedError } from "../login.error";
import { runLoginProtectionOperation } from "../login-protection.helper";
import { formatLoginFailureMessage, formatTemporaryLoginRestrictionMessage } from "../login-restriction-message";
import type {
  VerifiedWechatBindingAccount,
  WechatBindingAccount,
  WechatQrBindingPorts,
} from "./wechat-qr-binding.port";
import type { WechatQrDesktopContinuation } from "./wechat-qr-completion.use-case";

class BindingUnavailable extends CustomError {
  constructor(message: string) {
    super(message, { code: ApiErrorCode.InternalError, httpStatus: SERVICE_UNAVAILABLE });
  }
}

class BindingRejected extends Error {
  constructor(readonly reason: "account_changed" | "already_bound" | "binding_conflict") {
    super(reason);
  }
}

type SmsInput = { phoneNumber: string; capToken?: string; imageCaptchaProof?: string };

export function createWechatQrBindingUseCase(deps: WechatQrBindingPorts) {
  async function authorize(continuation: WechatQrDesktopContinuation, requestId: string) {
    if (continuation.root) return { kind: "ready" } as const;
    const { browser } = continuation;
    const request = await deps.state.readDesktop(browser, requestId);
    if (request?.status === "confirmed") return { kind: "ready" } as const;
    if (request?.status !== "binding_required") return { kind: "restart" } as const;
    if (request.bindingOwner) return { kind: "pending" } as const;
    return {
      kind: "authorized",
      binding: {
        browser,
        requestId,
        wxId: request.wxId,
        expiresAt: Math.min(request.expiresAt, continuation.expiresAt),
      },
    } as const;
  }

  function recordFailure(
    requestContext: ApiRequestContext,
    method: VerifiedWechatBindingAccount["method"],
    reason: string,
    user?: WechatBindingAccount,
    verified = false,
  ) {
    return deps.auditLogWriter.recordAuditLog({
      ...requestContext,
      ...buildWechatBindingAudit({ method, user, reason, verified }),
    });
  }

  async function assertUnrestricted(
    user: WechatBindingAccount,
    method: VerifiedWechatBindingAccount["method"],
    requestContext: ApiRequestContext,
    verified = false,
  ) {
    const restriction = await runLoginProtectionOperation({
      operation: () => deps.loginRestriction.getRestriction(user.id),
      auditUnavailable: () => recordFailure(requestContext, method, "login_protection_unavailable", user, verified),
    });
    if (restriction) {
      await recordFailure(requestContext, method, "too_many_login_failures", user, verified);
      throw new LoginFailedError(formatTemporaryLoginRestrictionMessage(restriction));
    }
  }

  async function rejectInvalidCredential(input: {
    action: HumanVerificationAction.WechatBindingPassword | HumanVerificationAction.WechatBindingSmsVerify;
    humanContext: HumanVerificationContext;
    requestContext: ApiRequestContext;
    account: WechatBindingAccount;
    method: VerifiedWechatBindingAccount["method"];
    reason: "invalid_password" | "invalid_verification_code";
    message: string;
  }): Promise<never> {
    const { action, humanContext, requestContext, account, method, reason, message } = input;
    await deps.humanRisk.recordLoginFailure(action, humanContext);
    const failure = await runLoginProtectionOperation({
      operation: () => deps.loginRestriction.recordFailure({ userId: account.id, triggerMethod: method }),
      auditUnavailable: () => recordFailure(requestContext, method, "login_protection_unavailable", account),
    });
    await recordFailure(requestContext, method, reason, account);
    throw new LoginFailedError(formatLoginFailureMessage(message, failure));
  }

  async function verifyPassword(
    binding: AuthorizedWechatQrBinding,
    input: { credential: string; capToken?: string; imageCaptchaProof?: string },
    requestContext: ApiRequestContext,
  ): Promise<VerifiedWechatBindingAccount> {
    const { username, password } = await deps.credentials.parseWechatBindingPasswordCredential(
      input.credential,
      binding,
    );
    const humanContext = {
      ...createHumanVerificationContext(requestContext, username),
      imageCaptchaProof: input.imageCaptchaProof,
      wechatQrRequestId: binding.requestId,
    };
    const action = HumanVerificationAction.WechatBindingPassword;
    await deps.humanVerification.ensureActionAllowed(action, input.capToken, humanContext);

    const account = await deps.users.getUserByUsername(username);
    if (!account) {
      await deps.humanRisk.recordLoginFailure(action, humanContext);
      await recordFailure(requestContext, "password", "user_lookup_failed");
      throw new LoginFailedError("用户名或密码错误");
    }
    await assertUnrestricted(account, "password", requestContext);
    if (!(await deps.verifyUserPassword(account, password)) || account.password === null) {
      return await rejectInvalidCredential({
        action,
        humanContext,
        requestContext,
        account,
        method: "password",
        reason: "invalid_password",
        message: "用户名或密码错误",
      });
    }
    return { ...account, method: "password", password: account.password };
  }

  function smsHumanContext(binding: AuthorizedWechatQrBinding, input: SmsInput, requestContext: ApiRequestContext) {
    return {
      ...createHumanVerificationContext(requestContext, input.phoneNumber),
      imageCaptchaProof: input.imageCaptchaProof,
      wechatQrRequestId: binding.requestId,
    };
  }

  async function sendSms(binding: AuthorizedWechatQrBinding, input: SmsInput, requestContext: ApiRequestContext) {
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.WechatBindingSmsSend,
      input.capToken,
      smsHumanContext(binding, input, requestContext),
    );
    const account = await deps.users.getUserByMobile(input.phoneNumber);
    if (!account) {
      await recordFailure(requestContext, "mobile", "user_lookup_failed");
      throw new LoginFailedError("请使用 IAM 已登记的手机号");
    }
    await assertUnrestricted(account, "mobile", requestContext);
    await assertAccess(account, "mobile", requestContext, false);
    const current = await deps.state.readDesktop(binding.browser, binding.requestId);
    if (current?.status === "confirmed") return "pending";
    if (current?.status !== "binding_required") return "restart";
    if (current.bindingOwner) return "pending";
    const sent = await deps.sms.sendWechatBindingCode({
      requestId: binding.requestId,
      expiresAt: binding.expiresAt,
      userId: account.id,
      phoneNumber: input.phoneNumber,
    });
    return sent ? "sent" : "restart";
  }

  async function verifySms(
    binding: AuthorizedWechatQrBinding,
    input: SmsInput & { code: string },
    requestContext: ApiRequestContext,
  ): Promise<VerifiedWechatBindingAccount> {
    const action = HumanVerificationAction.WechatBindingSmsVerify;
    const humanContext = smsHumanContext(binding, input, requestContext);
    await deps.humanVerification.ensureActionAllowed(action, input.capToken, humanContext);
    const account = await deps.users.getUserByMobile(input.phoneNumber);
    if (!account) {
      await deps.humanRisk.recordLoginFailure(action, humanContext);
      await recordFailure(requestContext, "mobile", "user_lookup_failed");
      throw new LoginFailedError("验证码错误");
    }
    await assertUnrestricted(account, "mobile", requestContext);
    const valid = await deps.sms.consumeWechatBindingCode(
      {
        requestId: binding.requestId,
        expiresAt: binding.expiresAt,
        userId: account.id,
        phoneNumber: input.phoneNumber,
      },
      input.code,
    );
    if (!valid) {
      return await rejectInvalidCredential({
        action,
        humanContext,
        requestContext,
        account,
        method: "mobile",
        reason: "invalid_verification_code",
        message: "验证码错误，请核对短信；若已使用请重新获取",
      });
    }
    return { ...account, method: "mobile", mobile: input.phoneNumber };
  }

  async function assertAccess(
    account: WechatBindingAccount,
    method: VerifiedWechatBindingAccount["method"],
    requestContext: ApiRequestContext,
    verified: boolean,
  ) {
    try {
      await deps.requireAccess(account.subjectIdentifier);
    } catch (error) {
      await recordFailure(requestContext, method, "subject_access_rejected", account, verified);
      throw error;
    }
  }

  async function bind(
    binding: AuthorizedWechatQrBinding,
    account: VerifiedWechatBindingAccount,
    requestContext: ApiRequestContext,
  ) {
    await assertUnrestricted(account, account.method, requestContext, true);
    await assertAccess(account, account.method, requestContext, true);
    const owner = await deps.state.reserveBinding(binding, {
      userId: account.id,
      subjectIdentifier: account.subjectIdentifier,
    });
    if (!owner) {
      const request = await deps.state.readDesktop(binding.browser, binding.requestId);
      if (request?.status === "confirmed") return "ready" as const;
      return request?.status === "binding_required" ? ("pending" as const) : ("restart" as const);
    }

    try {
      await deps.uow.transaction(
        async ({ userRepository, auditLogWriter, userDocumentInvalidation }) => {
          const locked = await userRepository.lockUserById(account.id);
          const current = locked && (await userRepository.getUserById(locked.id));
          if (
            !current ||
            current.subjectIdentifier !== account.subjectIdentifier ||
            (account.method === "password"
              ? current.password !== account.password || current.username !== account.username
              : current.mobile !== account.mobile)
          ) {
            throw new BindingRejected("account_changed");
          }
          if (current.wxId === binding.wxId) throw new BindingRejected("already_bound");
          if (current.wxId !== null) throw new BindingRejected("binding_conflict");
          if ((await userRepository.setFirstWechatBinding(current.id, binding.wxId)) === "conflict") {
            throw new BindingRejected("binding_conflict");
          }
          await auditLogWriter.recordAuditLog({
            ...requestContext,
            ...buildWechatBindingAudit({ user: current, method: account.method, verified: true }),
          });
          await userDocumentInvalidation.recordChanges([{ kind: "user", userId: current.id }]);
        },
        { observability: requestContext },
      );
    } catch (error) {
      const rolledBack = consumeTransactionRollbackConfirmation(error);
      const release = rolledBack && !(error instanceof BindingRejected && error.reason === "already_bound");
      // An unconfirmed transaction never transfers its submit right to a retry.
      const restored = await deps.state
        .finishBinding(binding, owner, release ? "release" : "restart")
        .catch(() => false);
      if (!rolledBack) throw new BindingUnavailable("暂时无法确认绑定结果，请重新扫码");
      if (!(error instanceof BindingRejected)) {
        throw new BindingUnavailable(restored ? "暂时无法绑定企业微信，请重试" : "暂时无法绑定企业微信，请重新扫码");
      }
      await recordFailure(requestContext, account.method, error.reason, account, true);
      if (error.reason === "already_bound") return "restart" as const;
      if (error.reason === "binding_conflict") throw new LoginFailedError("企业微信绑定冲突，请联系管理员");
      throw new LoginFailedError("账号状态已变化，请重新验证");
    }

    const published = await deps.state.finishBinding(binding, owner, "confirmed").catch(() => false);
    return published ? ("ready" as const) : ("restart" as const);
  }

  return { authorize, verifyPassword, sendSms, verifySms, bind };
}

export type WechatQrBindingUseCase = ReturnType<typeof createWechatQrBindingUseCase>;
