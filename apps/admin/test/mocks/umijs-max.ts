import { createElement, type ReactNode } from "react";
import { vi } from "vitest";

type LinkProps = {
  to?: string | { pathname?: string };
  href?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

const fullAdminAccess = {
  canAccessUser: true,
  canAccessOrganization: true,
  canAccessOrganizationResponsibility: true,
  canAccessPosition: true,
  canAccessEmployment: true,
  canAccessClient: true,
  canAccessRole: true,
  canAccessDelegation: true,
  canAccessSessionManagement: true,
  canAccessAudit: true,
  canAccessSystemLog: true,
  canCreateUser: true,
  canCreateDelegation: true,
  canCreateEmployment: true,
  canCreateOrganizationRoot: true,
  canCreateOrganizationResponsibility: true,
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
  location: window.location,
};

export function useLocation() {
  return history.location;
}

function getAccess<T = Record<string, unknown>>(): T {
  return accessMock as T;
}

export { getAccess as useAccess };

export function __setAccess(value: Record<string, unknown>) {
  accessMock = value;
}

export function __resetUmiMaxMocks() {
  accessMock = fullAdminAccess;
  history.push.mockReset();
  history.replace.mockReset();
}

export function Link({ to, href, children, ...rest }: LinkProps) {
  const resolvedHref = href ?? (typeof to === "string" ? to : to?.pathname);
  return createElement("a", { ...rest, href: resolvedHref ?? "#" }, children);
}
