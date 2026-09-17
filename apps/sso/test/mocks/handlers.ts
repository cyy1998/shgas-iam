import {
  ApiErrorCode,
  ClientStatus,
  LoginPageGuardDecision,
} from '@iam/contracts';
import { HttpResponse, http } from 'msw';
import {
  authenticationConfig,
  currentUserInfo,
  resetPasswordMaskedMobile,
} from './fixtures';

function ok<T>(data: T) {
  return HttpResponse.json({ code: 200, message: 'OK', data });
}

export const handlers = [
  http.get('*/sso/login-guard', () =>
    ok({ decision: LoginPageGuardDecision.Login }),
  ),
  http.get('*/oidc/login-guard', () =>
    HttpResponse.json({ decision: LoginPageGuardDecision.Login }),
  ),
  http.get('*/sso/.well-known/authentication-configuration', () =>
    ok(authenticationConfig),
  ),
  http.get('*/public/user-info', () => ok(currentUserInfo)),
  http.post('*/auth/login/password', () =>
    ok({
      isMobileSet: true,
    }),
  ),
  http.post('*/auth/login/mobile', () =>
    HttpResponse.json(
      {
        code: ApiErrorCode.LoginFailed,
        message: '账号或验证码错误',
        data: null,
      },
      { status: 400 },
    ),
  ),
  http.post('*/auth/logout', () => ok(null)),
  http.post('*/open/code/send', () => ok(null)),
  http.post('*/open/code/verify', () => ok({ result: true })),
  http.post('*/open/password/reset', () => ok(null)),
  http.get('*/open/client/status', () =>
    ok({
      clientCode: 'iam-admin',
      clientName: 'IAM 管理后台',
      status: ClientStatus.Enable,
      extAttributes: {},
    }),
  ),
  http.get('*/open/users/:username/masked-mobile', () =>
    ok(resetPasswordMaskedMobile),
  ),
  http.post('*/public/mobile/set', () => ok(null)),
];
