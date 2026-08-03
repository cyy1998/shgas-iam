import { describe, expect, it } from 'vitest';
import { mapCurrentAdminUser } from '../current-admin-user';

describe('mapCurrentAdminUser', () => {
  it('reads identity and roles only from the nested Custom SSO V1 projection', () => {
    expect(
      mapCurrentAdminUser({
        version: 1,
        subjectIdentifier: '00000000-0000-4000-8000-000000000001',
        profile: {
          username: 'admin',
          name: '管理员',
        },
        authorization: {
          employments: [],
          roles: ['iam:admin'],
          privileges: ['iam:user:read'],
        },
      }),
    ).toEqual({
      username: 'admin',
      name: '管理员',
      roles: ['iam:admin'],
    });
  });

  it('does not accept removed flat compatibility fields', () => {
    expect(
      mapCurrentAdminUser({
        version: 1,
        subjectIdentifier: '00000000-0000-4000-8000-000000000001',
        username: 'legacy-admin',
        name: '旧管理员',
        roles: ['iam:admin'],
      } as never),
    ).toEqual({
      username: '',
      name: '',
      roles: [],
    });
  });
});
