import { StyleProvider } from "@ant-design/cssinjs";
import { portalBase } from "@sso/constants/paths";
import { ssoTheme } from "@sso/theme";
import { restoreLoginRedirectState } from "@sso/utils/url";
import { ConfigProvider } from "antd";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { SsoRoutes } from "./SsoRoutes";
import "antd/dist/reset.css";

restoreLoginRedirectState();
ConfigProvider.config({ theme: ssoTheme });

const root = document.getElementById("root");
if (!root) throw new Error("SSO root element missing");

createRoot(root).render(
  <StyleProvider hashPriority="high">
    <ConfigProvider theme={ssoTheme}>
      <BrowserRouter basename={portalBase}>
        <SsoRoutes />
      </BrowserRouter>
    </ConfigProvider>
  </StyleProvider>,
);
