import type { ApiRequestContext } from "@auth-api/services/audit/audit.context";

export interface RequestPasswordResetCodeInput {
  username?: string;
  phoneNumber?: string;
}

export interface RequestPasswordResetCodeOptions {
  requestContext?: ApiRequestContext;
}
