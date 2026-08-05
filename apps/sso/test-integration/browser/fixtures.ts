import { ApiErrorCode } from '@iam/contracts';
// Mock-backend fixtures owned by the browser Integration collection.
import type { Page, Route } from '@playwright/test';
import {
  authenticationConfig,
  resetPasswordUserInfo,
} from '../../test/mocks/fixtures';

type SsoMockOptions = {
  passwordLogin?: 'success' | 'failure';
};

function ok<T>(data: T) {
  return { code: 200, message: 'OK', data };
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json: data,
    status,
  });
}

export async function mockSsoApi(page: Page, options: SsoMockOptions = {}) {
  const passwordLogin = options.passwordLogin ?? 'success';

  await page.route('**/sso/.well-known/authentication-configuration', (route) =>
    fulfillJson(route, ok(authenticationConfig)),
  );
  await page.route('**/auth/login/password', (route) => {
    if (passwordLogin === 'failure') {
      return fulfillJson(
        route,
        {
          code: ApiErrorCode.LoginFailed,
          message: '账号或密码错误',
          data: null,
        },
        400,
      );
    }
    return fulfillJson(route, ok({ isMobileSet: true }));
  });
  await page.route('**/auth/login/mobile', (route) =>
    fulfillJson(route, ok({ isMobileSet: true })),
  );
  await page.route('**/auth/logout', (route) => fulfillJson(route, ok(null)));
  await page.route('**/open/code/send', (route) =>
    fulfillJson(route, ok(null)),
  );
  await page.route('**/open/code/verify', (route) =>
    fulfillJson(route, ok({ result: true })),
  );
  await page.route('**/open/password/reset', (route) =>
    fulfillJson(route, ok(null)),
  );
  await page.route('**/open/users/userInfo**', (route) =>
    fulfillJson(route, ok(resetPasswordUserInfo)),
  );
  await page.route('**/public/mobile/set', (route) =>
    fulfillJson(route, ok(null)),
  );
}
