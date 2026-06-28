import { afterEach, describe, expect, it, vi } from 'vitest';
import { login, logout, mobileLogin } from '../auth';

const request = vi.hoisted(() => vi.fn());
const createPasswordLoginCredential = vi.hoisted(() => vi.fn());

vi.mock('@sso/utils/request', () => ({
  request,
}));

vi.mock('@sso/lib/login-credential', () => ({
  createPasswordLoginCredential,
}));

describe('auth service', () => {
  afterEach(() => {
    request.mockReset();
    createPasswordLoginCredential.mockReset();
  });

  it('posts encrypted password login payload', () => {
    createPasswordLoginCredential.mockReturnValue('credential');

    login(
      { username: 'zhangsan', password: 'secret', capToken: 'cap-token' },
      { suppressErrorMessage: true },
    );

    expect(createPasswordLoginCredential).toHaveBeenCalledWith({
      username: 'zhangsan',
      password: 'secret',
    });
    expect(request).toHaveBeenCalledWith('/auth/login/password', {
      method: 'POST',
      suppressErrorMessage: true,
      body: JSON.stringify({
        credential: 'credential',
        capToken: 'cap-token',
      }),
    });
  });

  it('posts mobile login payload as-is', () => {
    mobileLogin({ phoneNumber: '13800000000', code: '123456' });

    expect(request).toHaveBeenCalledWith('/auth/login/mobile', {
      method: 'POST',
      suppressErrorMessage: undefined,
      body: JSON.stringify({
        phoneNumber: '13800000000',
        code: '123456',
      }),
    });
  });

  it('posts logout request', () => {
    logout();

    expect(request).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
  });
});
