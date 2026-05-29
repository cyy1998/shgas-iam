import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type AdminAuditInputs = inferRouterInputs<AppRouter>['admin']['audit'];
type AdminAuditOutputs = inferRouterOutputs<AppRouter>['admin']['audit'];

export type AuditLogSearchParams = AdminAuditInputs['search'];
export type AuditLogSearchConditions = AuditLogSearchParams['conditions'];
export type AuditLogVo = AdminAuditOutputs['search']['result'][number];

export function searchAuditLogs(params: AuditLogSearchParams) {
  return apiClient.admin.audit.search.query(params);
}
