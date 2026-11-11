import { StyleProvider } from "@ant-design/cssinjs";
import { portalBase } from "@sso/constants/paths";
import { SsoProvider } from "@sso/models/sso";
import { ssoTheme } from "@sso/theme";
import { restoreLoginRedirectState } from "@sso/utils/url";
import { ConfigProvider } from "antd";
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "antd/dist/reset.css";

const LoginPage = lazy(() => import("./pages/login"));
const ResetPasswordPage = lazy(() => import("./pages/reset-password"));
const UserInfoPage = lazy(() => import("./pages/user-info"));
const SystemMaintenancePage = lazy(() => import("./pages/system-maintenance"));

restoreLoginRedirectState();
ConfigProvider.config({ theme: ssoTheme });

const root = document.getElementById("root");
if (!root) throw new Error("SSO root element missing");

createRoot(root).render(
  <StyleProvider hashPriority="high">
    <ConfigProvider theme={ssoTheme}>
      <SsoProvider>
        <BrowserRouter basename={portalBase}>
          <Suspense fallback={null}>
            <Routes>
              <Route index element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/userInfo" element={<UserInfoPage />} />
              <Route path="/systemMaintenance" element={<SystemMaintenancePage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SsoProvider>
    </ConfigProvider>
  </StyleProvider>,
);
