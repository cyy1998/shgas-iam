import { describe, expect, it } from 'vitest';
import { buildLoginRedirectUrl, buildLogoutRedirectUrl } from '../auth';

describe('admin auth url helpers', () => {
  it('builds SSO authorize URL with current location encoded', () => {
    expect(
      buildLoginRedirectUrl('http://localhost:8001/iam-admin/users?tab=启用'),
    ).toBe(
      '/sso/authorize?client=iam-admin&redirectUrl=http%3A%2F%2Flocalhost%3A8001%2Fiam-admin%2Fusers%3Ftab%3D%E5%90%AF%E7%94%A8',
    );
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
