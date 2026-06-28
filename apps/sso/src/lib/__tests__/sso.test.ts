import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../test/mocks/server';
import {
  buildAuthorizeUrl,
  buildLogoutUrl,
  fetchAuthenticationConfig,
} from '../sso';

describe('sso helpers', () => {
  it('builds encoded authorize and logout urls', () => {
    const cfg = {
      authorizationEndpoint: '/sso/authorize',
      logoutEndpoint: '/sso/logout',
    };
    const redirectUrl = 'http://example.test/iam-admin/users?tab=启用';

    expect(buildAuthorizeUrl(cfg, redirectUrl, 'iam admin')).toBe(
      '/sso/authorize?redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin%2Fusers%3Ftab%3D%E5%90%AF%E7%94%A8&client=iam%20admin',
    );
    expect(buildLogoutUrl(cfg, redirectUrl, 'iam admin')).toBe(
      '/sso/logout?redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin%2Fusers%3Ftab%3D%E5%90%AF%E7%94%A8&client=iam%20admin',
    );
  });

  it('consumes authentication configuration envelopes', async () => {
    await expect(fetchAuthenticationConfig()).resolves.toEqual({
      authorizationEndpoint: '/sso/authorize',
      logoutEndpoint: '/sso/logout',
    });
  });

  it('returns null when authentication configuration is unavailable', async () => {
    server.use(
      http.get('*/sso/.well-known/authentication-configuration', () =>
        HttpResponse.json({ code: 200, message: 'OK', data: {} }),
      ),
    );

    await expect(fetchAuthenticationConfig()).resolves.toBeNull();
  });
});
