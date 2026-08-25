import { createElement, type ReactNode } from 'react';
import { vi } from 'vitest';

type LinkProps = {
  to?: string | { pathname?: string };
  href?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

let modelMocks: Record<string, unknown> = {};
const fullAdminAccess = {
  canAccessUser: true,
  canAccessOrganization: true,
  canAccessOrganizationResponsibility: true,
  canAccessPosition: true,
  canAccessEmployment: true,
  canAccessClient: true,
  canAccessRole: true,
  canAccessSessionManagement: true,
  canAccessAudit: true,
  canAccessSystemLog: true,
  canCreateUser: true,
  canCreateEmployment: true,
  canCreateOrganizationRoot: true,
  canCreatePosition: true,
  canEditPosition: true,
  canChangePositionStatus: true,
  canDeletePosition: true,
};
let accessMock: Record<string, unknown> = fullAdminAccess;

export function defineConfig<T>(config: T): T {
  return config;
}

export const history = {
  push: vi.fn(),
  replace: vi.fn(),
  goBack: vi.fn(),
  location: window.location,
};

export const request = vi.fn();

// eslint-disable-next-line react/no-unnecessary-use-prefix -- mirrors @umijs/max
export function useLocation() {
  return history.location;
}

function getModel<T = unknown>(namespace: string): T {
  return (modelMocks[namespace] ?? {}) as T;
}

function getAccess<T = Record<string, unknown>>(): T {
  return accessMock as T;
}

export { getAccess as useAccess, getModel as useModel };

export function __setModel(namespace: string, value: unknown) {
  modelMocks = { ...modelMocks, [namespace]: value };
}

export function __setAccess(value: Record<string, unknown>) {
  accessMock = value;
}

export function __resetUmiMaxMocks() {
  modelMocks = {};
  accessMock = fullAdminAccess;
  history.push.mockReset();
  history.replace.mockReset();
  history.goBack.mockReset();
  request.mockReset();
}

export function Link({ to, href, children, ...rest }: LinkProps) {
  const resolvedHref = href ?? (typeof to === 'string' ? to : to?.pathname);
  return createElement('a', { ...rest, href: resolvedHref ?? '#' }, children);
}

export function Outlet() {
  return null;
}
