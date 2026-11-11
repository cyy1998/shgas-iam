import access from "@admin/access";
import { AdminAccessContext } from "@admin/admin-access";
import { type RenderOptions, render as testingLibraryRender } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import { createMemoryRouter, type RouteObject, RouterProvider } from "react-router";
import { adminCapabilitySummary } from "./mocks/fixtures";

type AdminAccess = ReturnType<typeof access>;
const fullAdminAccess = access({ capabilities: adminCapabilitySummary });
const deniedAccess = access({});

let testAccess = fullAdminAccess;

export function setTestAccess(permissions: Partial<AdminAccess>) {
  testAccess = { ...deniedAccess, ...permissions };
}

export function resetTestAccess() {
  testAccess = fullAdminAccess;
}

const RenderContentContext = createContext<ReactNode>(null);

function RenderContent() {
  return useContext(RenderContentContext);
}

type AdminRenderOptions = RenderOptions & {
  initialEntry?: string;
  path?: string;
};

export function render(ui: ReactElement, { initialEntry = "/", path = "*", ...options }: AdminRenderOptions = {}) {
  const routes: RouteObject[] = [{ path, Component: RenderContent }];
  if (path !== "*") routes.push({ path: "*", element: null });
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <ConfigProvider locale={zhCN}>
        <AdminAccessContext.Provider value={testAccess}>
          <RenderContentContext.Provider value={children}>
            <RouterProvider router={router} />
          </RenderContentContext.Provider>
        </AdminAccessContext.Provider>
      </ConfigProvider>
    );
  }

  return {
    user: userEvent.setup(),
    router,
    ...testingLibraryRender(ui, { ...options, wrapper: Providers }),
  };
}

export * from "@testing-library/react";
export { userEvent };
