import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/mocks/server';
import { history } from '../../../test/mocks/umijs-max';
import { request } from '../request';

describe('request auth redirect', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/portal/userInfo');
    server.use(
      http.get('*/public/user-info', () =>
        HttpResponse.json(
          { code: 401, message: '未登录', data: null },
          { status: 401 },
        ),
      ),
    );
  });

  async function requestUserInfo() {
    void request('/public/user-info');
    await vi.waitFor(() => {
      expect(history.replace).toHaveBeenCalledOnce();
    });
  }

  it('starts the SSO flow when the user info page returns 401', async () => {
    await requestUserInfo();

    expect(history.replace).toHaveBeenCalledWith(
      '/login?client=iam&redirectUrl=http%3A%2F%2Flocalhost%3A3000%2Fportal%2FuserInfo',
    );
  });

  it('preserves an existing SSO login context', async () => {
    window.history.pushState(
      {},
      '',
      '/portal/userInfo?client=iam-admin&redirectUrl=https%3A%2F%2Fadmin.example.test%2Fusers',
    );

    await requestUserInfo();

    expect(history.replace).toHaveBeenCalledWith(
      '/login?client=iam-admin&redirectUrl=https%3A%2F%2Fadmin.example.test%2Fusers',
    );
  });

  it('preserves an existing OIDC resume context', async () => {
    window.history.pushState(
      {},
      '',
      `/portal/userInfo?oidcReturn=${'a'.repeat(43)}`,
    );

    await requestUserInfo();

    expect(history.replace).toHaveBeenCalledWith(
      `/login?oidcReturn=${'a'.repeat(43)}`,
    );
  });
});
