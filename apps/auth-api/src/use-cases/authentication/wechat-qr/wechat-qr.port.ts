export interface WechatQrDirectoryPort {
  lookupApplicationName: (clientCode: string) => Promise<string | null>;
  findRegisteredMember: (wxId: string) => Promise<{ userId: number; subjectIdentifier: string } | null>;
  findRegisteredExternalIdentity: (
    identity: WechatExternalIdentity,
  ) => Promise<{ userId: number; subjectIdentifier: string } | null>;
}

export interface WechatQrIdentityPort {
  getQrIdentity: (code: string) => Promise<WechatQrIdentity>;
}

export interface WechatQrConfig {
  corpId: string;
  agentId: string;
  callbackUrl: string;
}

import type {
  WechatExternalIdentity,
  WechatQrIdentity,
} from "@auth-api/services/authentication/wechat-qr-identity.type";
import type { SessionOrigin } from "@auth-api/services/session/session-origin";
import type { AuditLogInput } from "@iam/contracts/audit";
import type { PublishedUserLoginProfile } from "@iam/domain/user";
import type { UserSessionObservation } from "@iam/session-kernel";
import type { AuthenticationLoginRestrictionStatus } from "../login-restriction.type";

export interface WechatQrCompletionPorts {
  principalSessions: {
    createClaimedPrincipalSession: (
      subjectIdentifier: string,
      options: { amr: readonly ["wechat"]; origin?: SessionOrigin },
      claim: () => Promise<boolean>,
      beforeDelivery: (observation: UserSessionObservation) => Promise<void>,
    ) => Promise<{ token: string; observation: UserSessionObservation } | null>;
  };
  users: {
    getActiveUserById: (userId: number) => Promise<{ id: number; subjectIdentifier: string } | null>;
    getLoginProfileById: (userId: number) => Promise<PublishedUserLoginProfile>;
  };
  loginRestriction: {
    getRestriction: (userId: number) => Promise<AuthenticationLoginRestrictionStatus | null>;
  };
  auditLogWriter: { recordAuditLog: (input: AuditLogInput) => Promise<void> };
}
