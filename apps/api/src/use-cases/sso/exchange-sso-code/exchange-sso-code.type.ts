import type { PrincipalSession, ProtocolArtifact } from "@iam/api-core/session/kernel";
import type { AuditRequestContext } from "@iam/domain/audit";
import type { UserDetailDto } from "@iam/domain/user";

export interface ExchangeSsoConsumedAuthCode {
  artifact: ProtocolArtifact;
  principalSession: PrincipalSession;
  userDetail: UserDetailDto;
}

export interface ExchangeSsoCodeInput {
  clientCode: string;
  clientSecret: string;
  code: string;
}

export interface ExchangeSsoCodeOptions {
  requestContext?: AuditRequestContext;
}

export interface ExchangeSsoCodeResult {
  sid: string;
  ttl: number;
  userInfo: UserDetailDto;
}
