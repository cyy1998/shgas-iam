import { beforeEach, expect, it, vi } from 'vitest';
import {
  getAdminAuthorizationReasonText,
  getAdminCapabilitySummary,
} from './authorization';

const { capabilitySummaryQuery } = vi.hoisted(() => ({
  capabilitySummaryQuery: vi.fn(),
}));

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      authorization: {
        capabilitySummary: { query: capabilitySummaryQuery },
      },
    },
  },
}));

beforeEach(() => {
  capabilitySummaryQuery.mockReset();
});

it('hides the capability procedure path behind the authorization service', async () => {
  const summary = { collectionActions: {}, visibleModules: [] };
  capabilitySummaryQuery.mockResolvedValue(summary);

  const result = await getAdminCapabilitySummary();

  expect(capabilitySummaryQuery).toHaveBeenCalledWith({});
  expect(result).toBe(summary);
});

it('maps every closed authorization reason to a localized explanation', () => {
  expect(getAdminAuthorizationReasonText('ACTION_NOT_GRANTED')).toBe(
    '当前管理员角色未授予此操作',
  );
  expect(getAdminAuthorizationReasonText('RESOURCE_OUT_OF_SCOPE')).toBe(
    '目标资源不在当前管理范围内',
  );
  expect(getAdminAuthorizationReasonText('USER_NOT_HR_MANAGED')).toBe(
    '该用户当前不属于可管理人员',
  );
  expect(
    getAdminAuthorizationReasonText('USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT'),
  ).toBe('该用户仍有范围外的开放任职');
  expect(getAdminAuthorizationReasonText('USER_NOT_ENABLED')).toBe(
    '该用户当前不是启用状态',
  );
  expect(getAdminAuthorizationReasonText('RESOURCE_STATE_NOT_ACTIONABLE')).toBe(
    '目标资源当前状态不支持此操作',
  );
  expect(getAdminAuthorizationReasonText('INTEGRITY_GUARD_BLOCKED')).toBe(
    '当前数据完整性约束阻止此操作',
  );
  expect(
    getAdminAuthorizationReasonText('UNMANAGEABLE_RESPONSIBILITY_BLOCKED'),
  ).toBe('存在当前管理员不可管理的开放责任任命，请联系完整管理员处理');
  expect(getAdminAuthorizationReasonText(null)).toBeNull();
});
