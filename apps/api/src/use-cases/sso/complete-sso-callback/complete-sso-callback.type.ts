import type { PrincipalSession, ProtocolArtifact } from "@iam/api-core/session/kernel";
import type { AuditRequestContext } from "@iam/domain/audit";
import type { UserDetailDto } from "@iam/domain/user";

export interface ConsumedSsoAuthCode {
  artifact: ProtocolArtifact;
  principalSession: PrincipalSession;
  userDetail: UserDetailDto;
}

export interface CompleteSsoCallbackInput {
  clientCode: string;
  code: string;
  redirectUrl: string;
}

export interface CompleteSsoCallbackOptions {
  requestContext?: AuditRequestContext;
}

export interface CompleteSsoCallbackResult {
  orcasSessionId: string | null;
  token: string;
}
