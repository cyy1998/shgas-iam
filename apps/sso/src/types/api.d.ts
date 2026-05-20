export type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

export type AuthConfig = {
  authorizationEndpoint: string;
  logoutEndpoint: string;
};

export type Employment = {
  id: string;
  compName: string;
  orgName: string;
  posName: string;
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
