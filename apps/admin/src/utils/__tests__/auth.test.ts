import { describe, expect, it, vi } from 'vitest';
import {
  buildLoginRedirectUrl,
  buildLogoutRedirectUrl,
  restoreLoginRedirectState,
} from '../auth';

describe('admin auth url helpers', () => {
  it('keeps the strict redirect stable and carries query/hash in state', () => {
    const authorizeUrl = new URL(
      buildLoginRedirectUrl(
        'http://localhost:8001/iam-admin/users?tab=启用#details',
      ),
      'http://localhost:8001',
    );

    expect(authorizeUrl.searchParams.get('redirectUrl')).toBe(
      'http://localhost:8001/iam-admin/users',
    );
    expect(authorizeUrl.searchParams.get('state')).toBe(
      'iam-first-party-navigation:v1:?tab=%E5%90%AF%E7%94%A8#details',
    );
  });

  it('restores the same-path query/hash after the trusted callback', () => {
    const authorizeUrl = new URL(
      buildLoginRedirectUrl(
        'http://localhost:8001/iam-admin/users?tab=启用#details',
      ),
      'http://localhost:8001',
    );
    const callbackUrl = new URL(
      authorizeUrl.searchParams.get('redirectUrl')!,
    );
    callbackUrl.searchParams.set('token', 'local-session');
    callbackUrl.searchParams.set(
      'state',
      authorizeUrl.searchParams.get('state')!,
    );
    const replaceState = vi.fn();
    const browserHistory = {
      state: { callback: true },
      replaceState,
    };
    const eventTarget = { dispatchEvent: vi.fn() };

    expect(
      restoreLoginRedirectState(
        callbackUrl.toString(),
        browserHistory,
        eventTarget,
      ),
    ).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(
      browserHistory.state,
      '',
      '/iam-admin/users?tab=%E5%90%AF%E7%94%A8#details',
    );
    expect(eventTarget.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'popstate',
        state: browserHistory.state,
      }),
    );
  });

  it('never restores a state value as a cross-origin destination', () => {
    const replaceState = vi.fn();
    const browserHistory = { state: null, replaceState };
    const eventTarget = { dispatchEvent: vi.fn() };

    for (const state of [
      'iam-first-party-navigation:v1:https://evil.example/',
      'iam-first-party-navigation:v1://evil.example/',
      'opaque-client-state',
    ]) {
      const callbackUrl = new URL(
        'http://localhost:8001/iam-admin/users?token=local-session',
      );
      callbackUrl.searchParams.set('state', state);
      expect(
        restoreLoginRedirectState(
          callbackUrl.toString(),
          browserHistory,
          eventTarget,
        ),
      ).toBe(false);
    }
    expect(replaceState).not.toHaveBeenCalled();
    expect(eventTarget.dispatchEvent).not.toHaveBeenCalled();
  });

  it('builds logout URL from the first admin base path segment', () => {
    expect(
      buildLogoutRedirectUrl({
        origin: 'http://localhost:8001',
        pathname: '/iam-admin/users',
      }),
    ).toBe('/sso/logout?redirectUrl=http%3A%2F%2Flocalhost%3A8001%2Fiam-admin');
  });

  it('uses an ampersand when logout URL already contains query params', () => {
    expect(
      buildLogoutRedirectUrl(
        {
          origin: 'http://localhost:8001',
          pathname: '/iam-admin/users',
        },
        '/sso/logout?from=admin',
      ),
    ).toBe(
      '/sso/logout?from=admin&redirectUrl=http%3A%2F%2Flocalhost%3A8001%2Fiam-admin',
    );
  });
});
