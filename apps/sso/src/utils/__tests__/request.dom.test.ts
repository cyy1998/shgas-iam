import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/mocks/server';
import { registerMswLifecycle } from '../../../test/setup-msw';
import { history } from '../../../test/mocks/umijs-max';
import { request } from '../request';
import { restoreLoginRedirectState } from '../url';

registerMswLifecycle();

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

  it('moves a first-party page query and hash into state', async () => {
    window.history.pushState(
      {},
      '',
      '/portal/userInfo?tab=启用#profile',
    );

    await requestUserInfo();

    const loginLocation = history.replace.mock.calls[0]?.[0];
    expect(typeof loginLocation).toBe('string');
    const loginUrl = new URL(
      loginLocation as string,
      'http://localhost:3000',
    );
    expect(loginUrl.pathname).toBe('/login');
    expect(loginUrl.searchParams.get('redirectUrl')).toBe(
      'http://localhost:3000/portal/userInfo',
    );
    expect(loginUrl.searchParams.get('state')).toBe(
      'iam-first-party-navigation:v1:?tab=%E5%90%AF%E7%94%A8#profile',
    );
    expect(loginUrl.searchParams.has('tab')).toBe(false);

    const callbackUrl = new URL(
      loginUrl.searchParams.get('redirectUrl')!,
    );
    callbackUrl.searchParams.set('token', 'local-session');
    callbackUrl.searchParams.set(
      'state',
      loginUrl.searchParams.get('state')!,
    );
    const replaceState = vi.fn();
    const eventTarget = { dispatchEvent: vi.fn() };
    expect(
      restoreLoginRedirectState(callbackUrl.toString(), {
        state: null,
        replaceState,
      }, eventTarget),
    ).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/portal/userInfo?tab=%E5%90%AF%E7%94%A8#profile',
    );
    expect(eventTarget.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'popstate',
        state: null,
      }),
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
