import { HttpResponse, http } from 'msw';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/mocks/server';
import { registerMswLifecycle } from '../../../test/setup-msw';
import {
  buildAuthorizeUrl,
  buildLogoutUrl,
  fetchAuthenticationConfig,
} from '../sso';

vi.hoisted(() => {
  vi.stubEnv(
    'UMI_APP_SSO_WELL_KNOWN_URL',
    'http://localhost/sso/.well-known/authentication-configuration',
  );
});

registerMswLifecycle();

afterAll(() => {
  vi.unstubAllEnvs();
});

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

  it('round-trips optional opaque state when login resumes authorization', () => {
    const cfg = {
      authorizationEndpoint: '/sso/authorize',
      logoutEndpoint: '/sso/logout',
    };

    expect(
      buildAuthorizeUrl(
        cfg,
        'https://client.example.com/callback',
        'independent',
        'opaque state !/?:&=%',
      ),
    ).toBe(
      '/sso/authorize?redirectUrl=https%3A%2F%2Fclient.example.com%2Fcallback&client=independent&state=opaque%20state%20!%2F%3F%3A%26%3D%25',
    );
    expect(
      buildAuthorizeUrl(
        cfg,
        'https://client.example.com/callback',
        'independent',
      ),
    ).not.toContain('state=');
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
