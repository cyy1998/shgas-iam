import type { HumanVerificationAction } from "@api/enums/humanVerification.action";
import type { AuditLogInput } from "@api/services/audit/audit.context";
import type { WechatBindingCodeScope } from "@api/services/authentication/wechat-binding.type";
import type { AuthorizedWechatQrBinding, WechatQrState } from "@api/services/authentication/wechat-qr.state";
import type { HumanRiskServicePort } from "@api/services/human-verification/human-verification.port";
import type { HumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import type { ApiUserDocumentChange } from "@api/services/user/user.port";
import type { UnitOfWorkPort } from "@iam/unit-of-work";
import type { AuthenticationLoginFailureStatus, AuthenticationLoginRestrictionStatus } from "../login-restriction.type";

export type WechatBindingAccount = {
  id: number;
  subjectIdentifier: string;
  username: string;
  name: string;
};

type CredentialAccount = WechatBindingAccount & { password: string | null };

export type VerifiedWechatBindingAccount = WechatBindingAccount &
  ({ method: "password"; password: string } | { method: "mobile"; mobile: string });

export interface WechatQrBindingTxPorts {
  userRepository: {
    lockUserById: (userId: number) => Promise<{ id: number } | null>;
    getUserById: (
      userId: number,
    ) => Promise<(CredentialAccount & { mobile: string | null; wxId: string | null }) | null>;
    setFirstWechatBinding: (userId: number, wxId: string) => Promise<"bound" | "conflict">;
  };
  auditLogWriter: { recordAuditLog: (input: AuditLogInput) => Promise<void> };
  userDocumentInvalidation: { recordChanges: (changes: readonly ApiUserDocumentChange[]) => Promise<void> };
}

export interface WechatQrBindingPorts {
  users: {
    getUserByUsername: (username: string) => Promise<CredentialAccount | null>;
    getUserByMobile: (mobile: string) => Promise<WechatBindingAccount | null>;
  };
  sms: {
    sendWechatBindingCode: (scope: WechatBindingCodeScope) => Promise<boolean>;
    consumeWechatBindingCode: (scope: WechatBindingCodeScope, code: string) => Promise<boolean>;
  };
  verifyUserPassword: (user: { password: string | null }, password: string) => Promise<boolean>;
  uow: UnitOfWorkPort<WechatQrBindingTxPorts>;
  state: Pick<WechatQrState, "readDesktop" | "reserveBinding" | "finishBinding">;
  credentials: {
    parseWechatBindingPasswordCredential: (
      credential: string,
      request: Pick<AuthorizedWechatQrBinding, "requestId" | "expiresAt">,
    ) => Promise<{ username: string; password: string }>;
  };
  humanVerification: {
    ensureActionAllowed: (
      action:
        | HumanVerificationAction.WechatBindingPassword
        | HumanVerificationAction.WechatBindingSmsSend
        | HumanVerificationAction.WechatBindingSmsVerify,
      token: string | undefined,
      context: HumanVerificationContext,
    ) => Promise<void>;
  };
  humanRisk: Pick<HumanRiskServicePort, "recordLoginFailure">;
  loginRestriction: {
    getRestriction: (userId: number) => Promise<AuthenticationLoginRestrictionStatus | null>;
    recordFailure: (input: {
      userId: number;
      triggerMethod: VerifiedWechatBindingAccount["method"];
    }) => Promise<AuthenticationLoginFailureStatus>;
  };
  requireAccess: (subjectIdentifier: string) => Promise<void>;
  auditLogWriter: WechatQrBindingTxPorts["auditLogWriter"];
}
