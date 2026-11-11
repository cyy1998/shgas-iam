import { portalBase } from "@sso/constants/paths";
import { SsoProvider } from "@sso/models/sso";
import { type RenderOptions, render as testingLibraryRender } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ReactElement, ReactNode } from "react";
import { BrowserRouter } from "react-router";

type SsoRenderOptions = RenderOptions & { withSso?: boolean };

export function render(ui: ReactElement, { withSso = false, ...options }: SsoRenderOptions = {}) {
  function Providers({ children }: { children: ReactNode }) {
    return (
      <ConfigProvider locale={zhCN}>
        <BrowserRouter basename={portalBase}>
          {withSso ? <SsoProvider>{children}</SsoProvider> : children}
        </BrowserRouter>
      </ConfigProvider>
    );
  }

  return {
    user: userEvent.setup(),
    ...testingLibraryRender(ui, { wrapper: Providers, ...options }),
  };
}

export * from "@testing-library/react";
export { userEvent };
