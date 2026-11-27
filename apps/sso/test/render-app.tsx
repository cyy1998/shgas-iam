import { portalBase } from "@sso/constants/paths";
import { SsoRoutes } from "@sso/SsoRoutes";
import { restoreLoginRedirectState } from "@sso/utils/url";
import { act, cleanup, configure, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigProvider, Modal, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter, MemoryRouter } from "react-router";
import { afterEach, beforeEach, vi } from "vitest";

const theme = { token: { motion: false } };

export function renderSsoApp(initialEntry: string, { memory = false, restoreCallback = false } = {}) {
  window.history.replaceState(null, "", initialEntry);
  if (restoreCallback) restoreLoginRedirectState();
  const { pathname, search, hash } = window.location;
  // Use BrowserRouter for navigations observed by services that read window.location.
  const Router = memory ? MemoryRouter : BrowserRouter;
  return {
    user: userEvent.setup(),
    ...render(
      <ConfigProvider locale={zhCN} theme={theme}>
        <Router basename={portalBase} initialEntries={[pathname + search + hash]}>
          <SsoRoutes />
        </Router>
      </ConfigProvider>,
    ),
  };
}

export function registerSsoAppLifecycle() {
  configure({ asyncUtilTimeout: 3000 });
  beforeEach(() => {
    ConfigProvider.config({
      holderRender: (children) => (
        <ConfigProvider locale={zhCN} theme={theme}>
          {children}
        </ConfigProvider>
      ),
    });
  });
  afterEach(async () => {
    cleanup();
    await act(async () => {
      Modal.destroyAll();
      message.destroy();
    });
    ConfigProvider.config({ holderRender: undefined });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });
}
