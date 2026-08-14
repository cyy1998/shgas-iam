import { LoginPageGuardDecision } from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('login page guard service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps the Custom SSO protocol route outside the REST API prefix', async () => {
    vi.stubEnv('UMI_APP_SSO_API_PREFIX', '/api/iam');
    vi.resetModules();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        code: 200,
        data: { decision: LoginPageGuardDecision.Login },
        message: 'success',
      }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    const { checkCustomSsoLoginPageGuard } = await import(
      '@sso/services/login-page-guard'
    );

    await expect(checkCustomSsoLoginPageGuard({
      client: 'iam-admin',
      redirectUrl: 'http://localhost:30080/iam-admin/',
    })).resolves.toBe('login');

    const requestUrl = fetchMock.mock.calls[0]?.[0];
    expect(new URL(String(requestUrl), 'http://localhost').pathname).toBe(
      '/sso/login-guard',
    );
  });
});
