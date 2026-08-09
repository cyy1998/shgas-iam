import { createElement, type ReactNode } from 'react';
import { vi } from 'vitest';
import { authenticationConfig } from './fixtures';

type LinkProps = {
  to?: string | { pathname?: string };
  href?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

let modelMocks: Record<string, unknown> = {
  sso: {
    authConfig: authenticationConfig,
  },
};
let accessMock: Record<string, unknown> = {};

export const history = {
  push: vi.fn(),
  replace: vi.fn(),
  goBack: vi.fn(),
  location: window.location,
};

export const request = vi.fn();

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
  modelMocks = {
    sso: {
      authConfig: authenticationConfig,
    },
  };
  accessMock = {};
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
