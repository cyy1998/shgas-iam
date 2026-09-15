import type { AdminModuleCode } from '@iam/contracts';

export const ADMIN_MODULE_ACCESS_KEYS = {
  user: 'canAccessUser',
  organization: 'canAccessOrganization',
  organizationResponsibility: 'canAccessOrganizationResponsibility',
  position: 'canAccessPosition',
  employment: 'canAccessEmployment',
  client: 'canAccessClient',
  role: 'canAccessRole',
  sessionManagement: 'canAccessSessionManagement',
  audit: 'canAccessAudit',
  systemLog: 'canAccessSystemLog',
} as const satisfies Record<AdminModuleCode, string>;

export const ADMIN_MANAGEMENT_ROUTE_REGISTRY = {
  '/users': 'user',
  '/organizations': 'organization',
  '/organization-responsibilities': 'organizationResponsibility',
  '/organization-responsibilities/assignments': 'organizationResponsibility',
  '/organization-responsibilities/types': 'organizationResponsibility',
  '/positions': 'position',
  '/employments': 'employment',
  '/clients': 'client',
  '/clients/:clientCode/edit': 'client',
  '/clients/:clientCode/sso': 'client',
  '/roles': 'role',
  '/sessions': 'sessionManagement',
  '/audit-logs': 'audit',
  '/system-logs': 'systemLog',
} as const satisfies Record<string, AdminModuleCode>;

export function getAdminRouteAccess(
  path: keyof typeof ADMIN_MANAGEMENT_ROUTE_REGISTRY,
) {
  return ADMIN_MODULE_ACCESS_KEYS[ADMIN_MANAGEMENT_ROUTE_REGISTRY[path]];
}
