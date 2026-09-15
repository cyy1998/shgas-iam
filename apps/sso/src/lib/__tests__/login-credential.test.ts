import { afterEach, describe, expect, it, vi } from 'vitest';

const LOGIN_CREDENTIAL_PREFIX = 'iam-login-credential';
const TEST_PUBLIC_KEY =
  '04112ddd8854e8262db2520bba112535844884c03348a45fcf4ee0f9a967979be52bd46caf43be697ae557ed2e4fa5b4dca8d2dbfa08c0f2f710c0f61591bb17dc';

async function loadCredentialModule(env: { kid?: string; publicKey?: string }) {
  vi.resetModules();
  vi.stubEnv('UMI_APP_SSO_LOGIN_CREDENTIAL_KID', env.kid ?? '');
  vi.stubEnv('UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY', env.publicKey ?? '');
  const createLoginCredential = vi.fn(
    () => `${LOGIN_CREDENTIAL_PREFIX}.opaque-token`,
  );
  vi.doMock('@iam/contracts', () => ({
    createLoginCredential,
  }));
  const module = await import('../login-credential');
  return { ...module, createLoginCredential };
}

describe('createPasswordLoginCredential', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@iam/contracts');
    vi.resetModules();
  });

  it('fails fast when encryption config is missing', async () => {
    const { createPasswordLoginCredential } = await loadCredentialModule({});

    expect(() =>
      createPasswordLoginCredential({
        username: 'zhangsan',
        password: 'raw-secret',
      }),
    ).toThrow('登录加密配置未就绪');
  });

  it('forwards login input and encryption config and returns the protocol credential', async () => {
    const { createLoginCredential, createPasswordLoginCredential } =
      await loadCredentialModule({
        kid: '2026-05-primary',
        publicKey: TEST_PUBLIC_KEY,
      });

    const credential = createPasswordLoginCredential({
      username: 'zhangsan',
      password: 'raw-secret',
    });

    expect(credential).toBe(`${LOGIN_CREDENTIAL_PREFIX}.opaque-token`);
    expect(createLoginCredential).toHaveBeenCalledWith({
      username: 'zhangsan',
      password: 'raw-secret',
      kid: '2026-05-primary',
      publicKey: TEST_PUBLIC_KEY,
    });
  });
});
