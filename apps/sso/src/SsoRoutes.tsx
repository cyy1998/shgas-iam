import { APPLICATION_ACCESS_DENIED_ROUTE } from "@iam/contracts";
import { SsoProvider } from "@sso/models/sso";
import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";

const LoginPage = lazy(() => import("./pages/login"));
const ResetPasswordPage = lazy(() => import("./pages/reset-password"));
const UserInfoPage = lazy(() => import("./pages/user-info"));
const SystemMaintenancePage = lazy(() => import("./pages/system-maintenance"));
const ApplicationAccessDeniedPage = lazy(() => import("./pages/application-access-denied"));

export function SsoRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path={APPLICATION_ACCESS_DENIED_ROUTE} element={<ApplicationAccessDeniedPage />} />
        <Route
          element={
            <SsoProvider>
              <Outlet />
            </SsoProvider>
          }
        >
          <Route index element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/userInfo" element={<UserInfoPage />} />
          <Route path="/systemMaintenance" element={<SystemMaintenancePage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
