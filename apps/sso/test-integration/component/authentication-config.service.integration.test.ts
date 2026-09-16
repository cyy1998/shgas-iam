import { buildAuthorizeUrl, buildLogoutUrl } from '@sso/lib/sso';
import { fetchAuthenticationConfig } from '@sso/services/authentication-config';
import { HttpResponse, http } from 'msw';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { server } from '~sso/test/mocks/server';

vi.hoisted(() => {
  vi.stubEnv(
    'UMI_APP_SSO_WELL_KNOWN_URL',
    'http://localhost/sso/.well-known/authentication-configuration',
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('authentication configuration service', () => {
  it.each(['https://internal.example', 'https://public.example'])(
    'uses discovery endpoints only after checking entry %s',
    async (origin) => {
      server.use(
        http.get('*/sso/.well-known/authentication-configuration', () =>
          HttpResponse.json({
            data: {
              authorizationEndpoint: `${origin}/sso/authorize`,
              logoutEndpoint: `${origin}/sso/logout`,
            },
          }),
        ),
      );
      const config = await fetchAuthenticationConfig(origin);
      expect(config).not.toBeNull();
      const target = buildAuthorizeUrl(
        config!,
        'https://business.example/home',
        'client',
      );
      expect(target).toMatch(/^\/sso\/authorize\?/);
      expect(new URL(target, origin).origin).toBe(origin);
      expect(new URL(target, origin).searchParams.get('redirectUrl')).toBe(
        'https://business.example/home',
      );
      expect(
        buildLogoutUrl(config!, 'https://business.example/home', 'client'),
      ).toMatch(/^\/sso\/logout\?/);
    },
  );

  it.each([
    'https://stranger.example/sso/authorize',
    '//stranger.example/sso/authorize',
    'https://user@localhost/sso/authorize',
    '/..//stranger.example',
  ])(
    'rejects discovery navigation outside this entry: %s',
    async (endpoint) => {
      server.use(
        http.get('*/sso/.well-known/authentication-configuration', () =>
          HttpResponse.json({
            data: {
              authorizationEndpoint: endpoint,
              logoutEndpoint: '/sso/logout',
            },
          }),
        ),
      );
      expect(await fetchAuthenticationConfig('http://localhost')).toBeNull();
    },
  );

  it('consumes authentication configuration envelopes', async () => {
    await expect(
      fetchAuthenticationConfig('http://localhost'),
    ).resolves.toEqual({
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

    await expect(
      fetchAuthenticationConfig('http://localhost'),
    ).resolves.toBeNull();
  });
});
