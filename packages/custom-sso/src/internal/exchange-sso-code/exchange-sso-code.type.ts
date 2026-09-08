import type { CustomSsoSubjectProjection } from "@iam/custom-sso/wire";
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
  subject: CustomSsoSubjectProjection;
}
