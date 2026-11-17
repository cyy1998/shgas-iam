import { portalBase } from "@sso/constants/paths";
import { SsoProvider } from "@sso/models/sso";
import { type RenderOptions, render as testingLibraryRender } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ReactElement, ReactNode } from "react";
import { BrowserRouter } from "react-router";

type SsoRenderOptions = RenderOptions & { withSso?: boolean };

function Providers({ children, withSso }: { children: ReactNode; withSso: boolean }) {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter basename={portalBase}>{withSso ? <SsoProvider>{children}</SsoProvider> : children}</BrowserRouter>
    </ConfigProvider>
  );
}

export function render(ui: ReactElement, { withSso = false, ...options }: SsoRenderOptions = {}) {
  return {
    user: userEvent.setup(),
    ...testingLibraryRender(ui, {
      wrapper: ({ children }) => <Providers withSso={withSso}>{children}</Providers>,
      ...options,
    }),
  };
}

export * from "@testing-library/react";
export { userEvent };
