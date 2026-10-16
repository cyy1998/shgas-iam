import { vi } from "vitest";
import { authenticationConfig } from "./fixtures";

let modelMocks: Record<string, unknown> = {
  sso: {
    authConfig: authenticationConfig,
  },
};

export const history = {
  push: vi.fn(),
  replace: vi.fn(),
};

function getModel<T = unknown>(namespace: string): T {
  return (modelMocks[namespace] ?? {}) as T;
}

export { getModel as useModel };

export function __setModel(namespace: string, value: unknown) {
  modelMocks = { ...modelMocks, [namespace]: value };
}

export function __resetUmiMaxMocks() {
  modelMocks = {
    sso: {
      authConfig: authenticationConfig,
    },
  };
  history.push.mockReset();
  history.replace.mockReset();
}
