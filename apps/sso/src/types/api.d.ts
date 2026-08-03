import type {
  CustomSsoEmploymentV1,
  CustomSsoSubjectProjectionV1,
} from '@iam/client-subject-projection/custom-sso';
import type { ApiErrorCode, ClientStatus } from '@iam/contracts';

export type ApiEnvelope<T> = {
  code: ApiErrorCode | number | string;
  message: string;
  data: T;
};

export type AuthConfig = {
  authorizationEndpoint: string;
  logoutEndpoint: string;
};

export type Employment = CustomSsoEmploymentV1;

export type UserInfo = CustomSsoSubjectProjectionV1;

export type AccountLookupUserInfo = {
  username: string;
  name: string;
  mobile: string | null;
};

export type SmsUsage = 'login' | 'resetPassword' | 'bindPhone';

export type HumanVerificationAction =
  | 'sendSmsCode'
  | 'passwordLogin'
  | 'mobileLogin'
  | 'openUserInfoLookup';

export type LoginPasswordResult = {
  isMobileSet: boolean;
};

export type ClientStatusResult = {
  clientCode: string;
  clientName: string;
  status: ClientStatus;
  extAttributes?: Record<string, unknown> | null;
} | null;
