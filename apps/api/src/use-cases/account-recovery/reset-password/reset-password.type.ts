import type { ApiRequestContext } from "@api/services/audit/audit.context";

export interface ResetPasswordInput {
  code: string;
  newPassword: string;
  phoneNumber?: string;
  username: string;
}

export interface ResetPasswordOptions {
  requestContext?: ApiRequestContext;
}

export interface AccountRecoveryUser {
  id: number;
  username: string;
  name?: string | null;
  mobile: string | null;
}

export interface PasswordResetCodeReservation {
  usage: string;
  phone: string;
  token: string;
}
