import type { ApiErrorCode, ClientStatus } from '@iam/contracts';
import type {
  CustomSsoEmployment,
  CustomSsoSubjectProjection,
} from '@iam/custom-sso/wire';

export type ApiEnvelope<T> = {
  code: ApiErrorCode | number | string;
  message: string;
  data: T;
};

export type AuthConfig = {
  authorizationEndpoint: string;
  logoutEndpoint: string;
};

export type Employment = CustomSsoEmployment;

export type UserInfo = CustomSsoSubjectProjection;

export type MaskedMobile = {
  mobile: string | null;
};

export type SmsUsage = 'login' | 'resetPassword' | 'bindPhone';

export type HumanVerificationAction =
  'sendSmsCode' | 'passwordLogin' | 'mobileLogin' | 'openUserInfoLookup';

export type LoginPasswordResult = {
  isMobileSet: boolean;
};

export type ClientStatusResult = {
  clientCode: string;
  clientName: string;
  status: ClientStatus;
  extAttributes?: Record<string, unknown> | null;
} | null;
