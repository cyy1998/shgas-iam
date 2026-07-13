import type { ApiRequestContext } from "@api/services/audit/audit.service";

export interface RequestPasswordResetCodeInput {
  username?: string;
  phoneNumber?: string;
}

export interface RequestPasswordResetCodeOptions {
  requestContext?: ApiRequestContext;
}
