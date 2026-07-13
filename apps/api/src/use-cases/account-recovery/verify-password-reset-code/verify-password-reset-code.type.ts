import type { ApiRequestContext } from "@api/services/audit/audit.service";

export interface VerifyPasswordResetCodeInput {
  code: string;
  username?: string;
  phoneNumber?: string;
}

export interface VerifyPasswordResetCodeOptions {
  requestContext?: ApiRequestContext;
}
