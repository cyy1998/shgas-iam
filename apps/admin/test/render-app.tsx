import { adminRoutes } from "@admin/routes";
import { restoreLoginRedirectState } from "@admin/utils/auth";
import { act, cleanup, configure, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigProvider, Modal, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach } from "vitest";

const theme = { token: { motion: false } };
const routers = new Set<ReturnType<typeof createMemoryRouter>>();

export function renderAdminApp(initialEntry: string, { restoreCallback = false } = {}) {
  window.history.replaceState(null, "", initialEntry);
  if (restoreCallback) restoreLoginRedirectState();
  const { pathname, search, hash } = window.location;
  const router = createMemoryRouter(adminRoutes, {
    basename: "/iam-admin",
    initialEntries: [pathname + search + hash],
  });
  routers.add(router);
  const view = render(
    <ConfigProvider locale={zhCN} theme={theme}>
      <RouterProvider router={router} />
    </ConfigProvider>,
  );
  return {
    ...view,
    router,
    user: userEvent.setup(),
    unmount() {
      view.unmount();
      router.dispose();
      routers.delete(router);
    },
  };
}

export function registerAdminAppLifecycle() {
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
    for (const router of routers) router.dispose();
    routers.clear();
    await act(async () => {
      Modal.destroyAll();
      message.destroy();
    });
    ConfigProvider.config({ holderRender: undefined });
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });
}
