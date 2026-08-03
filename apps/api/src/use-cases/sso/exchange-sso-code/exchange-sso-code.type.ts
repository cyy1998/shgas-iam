import type { CustomSsoSubjectProjectionV1 } from "@iam/client-subject-projection/custom-sso";
import type { AuditRequestContext } from "@iam/domain/audit";

export interface ExchangeSsoCodeInput {
  clientCode: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

export interface ExchangeSsoCodeOptions {
  requestContext?: AuditRequestContext;
}

export interface ExchangeSsoCodeResult {
  sid: string;
  ttl: number;
  subject: CustomSsoSubjectProjectionV1;
}
