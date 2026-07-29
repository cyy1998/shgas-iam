import { ApiErrorCode } from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listLoginRestrictions,
  listSessions,
  LoginRestrictionListError,
  LoginRestrictionListErrorKind,
  LoginRestrictionReleaseError,
  LoginRestrictionReleaseErrorKind,
  releaseLoginRestriction,
  revokeSessions,
  SessionListError,
  SessionListErrorKind,
  SessionRevokeError,
  SessionRevokeErrorKind,
} from '../session-management';

const sessionListQuery = vi.hoisted(() => vi.fn());
const sessionRevokeMutation = vi.hoisted(() => vi.fn());
const loginRestrictionListQuery = vi.hoisted(() => vi.fn());
const loginRestrictionReleaseMutation = vi.hoisted(() => vi.fn());

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      sessionManagement: {
        listLoginRestrictions: { query: loginRestrictionListQuery },
        listSessions: { query: sessionListQuery },
        releaseLoginRestriction: { mutate: loginRestrictionReleaseMutation },
        revokeSessions: { mutate: sessionRevokeMutation },
      },
    },
  },
}));

describe('session management service wrapper', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes the shared unavailable service code for the page', async () => {
    sessionListQuery.mockRejectedValueOnce(
      Object.assign(new Error('internal transport message'), {
        data: {
          httpStatus: 500,
          serviceCode: ApiErrorCode.AdminLoginStateUnavailable,
        },
      }),
    );

    await expect(
      listSessions({
        conditions: {},
        pageNum: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      name: SessionListError.name,
      kind: SessionListErrorKind.LoginStateUnavailable,
      message: '登录状态服务暂时不可用',
    });
  });

  it('normalizes an unavailable restriction inventory without exposing transport details', async () => {
    loginRestrictionListQuery.mockRejectedValueOnce(
      Object.assign(new Error('redis host must stay internal'), {
        data: {
          httpStatus: 500,
          serviceCode: ApiErrorCode.AdminLoginStateUnavailable,
        },
      }),
    );

    await expect(
      listLoginRestrictions({
        conditions: {},
        pageNum: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      name: LoginRestrictionListError.name,
      kind: LoginRestrictionListErrorKind.LoginStateUnavailable,
      message: '登录状态服务暂时不可用',
    });
  });

  it('returns the safe restriction inventory from the shared Admin API intent', async () => {
    const input = {
      conditions: { userId: 42 },
      pageNum: 1,
      pageSize: 20,
    };
    const response = {
      result: [
        {
          user: {
            id: 42,
            username: 'zhangsan',
            name: '张三',
            accountStatus: 'normal' as const,
          },
          cause: 'too_many_login_failures' as const,
          triggerMethod: 'password' as const,
          restrictedUntil: 1_900_000_000_000,
          remainingSeconds: 120,
        },
      ],
      total: 1,
      pageNum: 1,
      pageSize: 20,
      pages: 1,
    };
    loginRestrictionListQuery.mockResolvedValueOnce(response);

    await expect(listLoginRestrictions(input)).resolves.toEqual(response);
    expect(loginRestrictionListQuery).toHaveBeenCalledTimes(1);
    expect(loginRestrictionListQuery).toHaveBeenCalledWith(input);
  });

  it('does not expose or misclassify an arbitrary restriction-list HTTP 503', async () => {
    loginRestrictionListQuery.mockRejectedValueOnce(
      Object.assign(new Error('provider detail must stay internal'), {
        data: {
          httpStatus: 503,
          serviceCode: 'ANOTHER_SERVICE_UNAVAILABLE',
        },
      }),
    );

    await expect(
      listLoginRestrictions({
        conditions: {},
        pageNum: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      name: LoginRestrictionListError.name,
      kind: LoginRestrictionListErrorKind.RequestFailed,
      message: '临时登录限制加载失败',
    });
  });

  it('normalizes restriction audit failure after effect without retrying the mutation', async () => {
    loginRestrictionReleaseMutation.mockRejectedValueOnce(
      Object.assign(new Error('postgres host must stay internal'), {
        data: {
          httpStatus: 500,
          serviceCode: ApiErrorCode.AdminLoginStateAuditFailedAfterEffect,
        },
      }),
    );
    const input = { userId: 42 };

    await expect(releaseLoginRestriction(input)).rejects.toMatchObject({
      name: LoginRestrictionReleaseError.name,
      kind: LoginRestrictionReleaseErrorKind.AuditFailedAfterEffect,
      message: '操作可能已生效，但审计记录失败',
    });
    expect(loginRestrictionReleaseMutation).toHaveBeenCalledTimes(1);
    expect(loginRestrictionReleaseMutation).toHaveBeenCalledWith(input);
  });

  it.each([
    {
      serviceCode: ApiErrorCode.AdminLoginStateUnavailable,
      expectedKind: LoginRestrictionReleaseErrorKind.LoginStateUnavailable,
      expectedMessage: '登录状态服务暂时不可用',
    },
    {
      serviceCode: 'ANOTHER_INTERNAL_ERROR',
      expectedKind: LoginRestrictionReleaseErrorKind.RequestFailed,
      expectedMessage: '临时登录限制解除失败',
    },
  ])(
    'normalizes $serviceCode to a stable restriction release error',
    async ({ serviceCode, expectedKind, expectedMessage }) => {
      loginRestrictionReleaseMutation.mockRejectedValueOnce(
        Object.assign(new Error('transport detail must stay internal'), {
          data: { serviceCode },
        }),
      );

      await expect(
        releaseLoginRestriction({ userId: 42 }),
      ).rejects.toMatchObject({
        name: LoginRestrictionReleaseError.name,
        kind: expectedKind,
        message: expectedMessage,
      });
      expect(loginRestrictionReleaseMutation).toHaveBeenCalledTimes(1);
    },
  );

  it('returns the safe restriction release result from the shared Admin API intent', async () => {
    const input = { userId: 42 };
    const response = {
      changed: false,
      failureStateCleared: true as const,
    };
    loginRestrictionReleaseMutation.mockResolvedValueOnce(response);

    await expect(releaseLoginRestriction(input)).resolves.toEqual(response);
    expect(loginRestrictionReleaseMutation).toHaveBeenCalledTimes(1);
    expect(loginRestrictionReleaseMutation).toHaveBeenCalledWith(input);
  });

  it('does not expose or misclassify an arbitrary HTTP 503', async () => {
    sessionListQuery.mockRejectedValueOnce(
      Object.assign(
        new Error('database host and credentials must stay internal'),
        {
          data: {
            httpStatus: 503,
            serviceCode: 'ANOTHER_SERVICE_UNAVAILABLE',
          },
        },
      ),
    );

    await expect(
      listSessions({
        conditions: {},
        pageNum: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      name: SessionListError.name,
      kind: SessionListErrorKind.RequestFailed,
      message: '有效会话加载失败',
    });
  });

  it('normalizes audit failure after effect without exposing transport details or retrying', async () => {
    sessionRevokeMutation.mockRejectedValueOnce(
      Object.assign(
        new Error('postgres host and statement must stay internal'),
        {
          data: {
            httpStatus: 500,
            serviceCode: 'ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT',
            serviceMessage:
              '登录状态已变更，但审计记录失败；请刷新确认且不要自动重试',
          },
        },
      ),
    );
    const input = {
      target: {
        type: 'session' as const,
        principalSessionId: 'ps-target',
      },
    };

    await expect(revokeSessions(input)).rejects.toMatchObject({
      name: SessionRevokeError.name,
      kind: SessionRevokeErrorKind.AuditFailedAfterEffect,
      message: '操作可能已生效，但审计记录失败',
    });
    expect(sessionRevokeMutation).toHaveBeenCalledTimes(1);
    expect(sessionRevokeMutation).toHaveBeenCalledWith(input);
  });

  it.each([
    {
      serviceCode: 'ADMIN_SESSION_CURRENT_PROTECTED',
      expectedKind: SessionRevokeErrorKind.CurrentSessionProtected,
      expectedMessage: '当前管理会话受保护',
    },
    {
      serviceCode: ApiErrorCode.AdminLoginStateUnavailable,
      expectedKind: SessionRevokeErrorKind.LoginStateUnavailable,
      expectedMessage: '登录状态服务暂时不可用',
    },
    {
      serviceCode: 'ANOTHER_INTERNAL_ERROR',
      expectedKind: SessionRevokeErrorKind.RequestFailed,
      expectedMessage: '会话下线失败',
    },
  ])(
    'normalizes $serviceCode to a stable revoke error',
    async ({ serviceCode, expectedKind, expectedMessage }) => {
      sessionRevokeMutation.mockRejectedValueOnce(
        Object.assign(new Error('transport detail must stay internal'), {
          data: { serviceCode },
        }),
      );

      await expect(
        revokeSessions({
          target: {
            type: 'session',
            principalSessionId: 'ps-target',
          },
        }),
      ).rejects.toMatchObject({
        name: SessionRevokeError.name,
        kind: expectedKind,
        message: expectedMessage,
      });
    },
  );

  it('returns the safe revoke result from the shared Admin API intent', async () => {
    const response = {
      changed: false,
      scope: 'session' as const,
      revoked: {
        principalSessions: 0,
        bindings: 0,
        credentials: 0,
        artifacts: 0,
      },
      currentPrincipalSessionExcluded: false,
      cleanup: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
    };
    sessionRevokeMutation.mockResolvedValueOnce(response);

    await expect(
      revokeSessions({
        target: {
          type: 'session',
          principalSessionId: 'ps-inactive',
        },
      }),
    ).resolves.toEqual(response);
  });

  it('passes a user target through the same shared revoke intent', async () => {
    const response = {
      changed: true,
      scope: 'user' as const,
      revoked: {
        principalSessions: 2,
        bindings: 3,
        credentials: 4,
        artifacts: 1,
      },
      currentPrincipalSessionExcluded: true,
      cleanup: {
        attempted: 1,
        succeeded: 1,
        failed: 0,
      },
    };
    const input = {
      target: {
        type: 'user' as const,
        userId: 42,
      },
    };
    sessionRevokeMutation.mockResolvedValueOnce(response);

    await expect(revokeSessions(input)).resolves.toEqual(response);
    expect(sessionRevokeMutation).toHaveBeenCalledTimes(1);
    expect(sessionRevokeMutation).toHaveBeenCalledWith(input);
  });
});
