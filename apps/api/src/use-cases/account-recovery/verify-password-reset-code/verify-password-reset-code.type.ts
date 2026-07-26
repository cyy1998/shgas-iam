import type { ApiRequestContext } from "@api/services/audit/audit.context";

export interface VerifyPasswordResetCodeInput {
  code: string;
  username?: string;
  phoneNumber?: string;
}

export interface VerifyPasswordResetCodeOptions {
  requestContext?: ApiRequestContext;
}
