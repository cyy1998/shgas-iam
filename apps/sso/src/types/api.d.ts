import type { ApiErrorCode } from '@iam/contracts';

export type ApiEnvelope<T> = {
  code: ApiErrorCode | number | string;
  message: string;
  data: T;
};

export type AuthConfig = {
  authorizationEndpoint: string;
  logoutEndpoint: string;
};

export type Employment = {
  id: string;
  position: {
    posCode: string;
    posName: string;
  };
  organization?: {
    assignedOrg?: { orgCode: string; orgName: string };
    fullOrgPath?: { orgCode: string; orgName: string }[];
    companyNodes?: { orgCode: string; orgName: string }[];
  };
};

export type UserInfo = {
  username: string;
  name: string;
  mobile: string | null;
  isMobileSet: boolean;
  employments: Employment[];
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

export type ClientStatus = {
  status: number;
  extAttributes?: Record<string, unknown> | null;
};
