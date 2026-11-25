import type { ApiRequestContext } from "@auth-api/services/audit/audit.context";
import { buildWechatLoginSuccessAudit } from "@auth-api/services/audit/events/auth.audit";
import type { WechatQrBrowser, WechatQrState } from "@auth-api/services/authentication/wechat-qr.state";
import { toSessionOrigin } from "@auth-api/services/session/session-origin";
import { LoginRestrictionUnavailableError } from "@iam/login-restriction";
import type { UserSessionObservation } from "@iam/session-kernel";
import { LoginFailedError } from "../login.error";
import { LoginProtectionUnavailableError } from "../login-protection.error";
import { formatTemporaryLoginRestrictionMessage } from "../login-restriction-message";
import type { WechatQrCompletionPorts } from "./wechat-qr.port";

export interface WechatQrDesktopContinuation {
  browser: WechatQrBrowser;
  clientCode: string;
  expiresAt: number;
  root: UserSessionObservation | null;
}

export type PrepareWechatQrContinuation = (root: {
  kind: "created" | "existing";
  observation: UserSessionObservation;
}) => Promise<void>;

export function createWechatQrCompletionUseCase(
  options: WechatQrCompletionPorts & { state: Pick<WechatQrState, "readDesktop" | "claimDesktop"> },
) {
  const { state, principalSessions, users, loginRestriction, auditLogWriter } = options;

  return {
    async execute(
      continuation: WechatQrDesktopContinuation,
      requestId: string,
      requestContext: ApiRequestContext,
      prepareContinuation?: PrepareWechatQrContinuation,
    ) {
      if (continuation.root) {
        await prepareContinuation?.({ kind: "existing", observation: continuation.root });
        return { kind: "existing" as const };
      }
      const request = await state.readDesktop(continuation.browser, requestId);
      if (request?.status === "waiting" || request?.status === "binding_required") return { kind: "pending" as const };
      if (request?.status !== "confirmed") return { kind: "restart" as const };

      const { member } = request;
      const activeUser = await users.getActiveUserById(member.userId);
      if (!activeUser || activeUser.subjectIdentifier !== member.subjectIdentifier) {
        throw new LoginFailedError("账号不可用");
      }
      const restriction = await loginRestriction.getRestriction(member.userId).catch((error: unknown) => {
        if (error instanceof LoginRestrictionUnavailableError) throw new LoginProtectionUnavailableError(error);
        throw error;
      });
      if (restriction) throw new LoginFailedError(formatTemporaryLoginRestrictionMessage(restriction));
      const profile = await users.getLoginProfileById(member.userId);
      const session = await principalSessions.createClaimedPrincipalSession(
        member.subjectIdentifier,
        { amr: ["wechat"], origin: toSessionOrigin(requestContext) },
        () => state.claimDesktop(continuation.browser, requestId, member, continuation.expiresAt),
        async (observation) => {
          await prepareContinuation?.({ kind: "created", observation });
          await auditLogWriter.recordAuditLog({
            ...requestContext,
            ...buildWechatLoginSuccessAudit({ ...profile, id: member.userId }, "cross_device"),
          });
        },
      );
      if (!session) return { kind: "restart" as const };
      return { kind: "created" as const, token: session.token, remainingSeconds: session.observation.remainingSeconds };
    },
  };
}

export type WechatQrCompletionUseCase = ReturnType<typeof createWechatQrCompletionUseCase>;
