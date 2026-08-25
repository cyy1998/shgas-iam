import { apiClient } from '@admin/lib/api-client';
import type { AdminAuthorizationReasonCode } from '@iam/contracts';

const authorizationReasonText = {
  ACTION_NOT_GRANTED: '当前管理员角色未授予此操作',
  RESOURCE_OUT_OF_SCOPE: '目标资源不在当前管理范围内',
  USER_NOT_HR_MANAGED: '该用户当前不属于可管理人员',
  USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT: '该用户仍有范围外的开放任职',
  USER_NOT_ENABLED: '该用户当前不是启用状态',
  RESOURCE_STATE_NOT_ACTIONABLE: '目标资源当前状态不支持此操作',
  INTEGRITY_GUARD_BLOCKED: '当前数据完整性约束阻止此操作',
} as const satisfies Record<AdminAuthorizationReasonCode, string>;

export function getAdminCapabilitySummary() {
  return apiClient.admin.authorization.capabilitySummary.query({});
}

export function getAdminAuthorizationReasonText(
  reason: AdminAuthorizationReasonCode | null,
) {
  return reason === null ? null : authorizationReasonText[reason];
}
