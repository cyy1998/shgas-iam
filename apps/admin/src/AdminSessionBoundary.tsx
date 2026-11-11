import { Button, Result } from "antd";
import { useMemo } from "react";
import { Navigate, Outlet, useNavigate } from "react-router";
import access from "./access";
import { AdminAccessContext, useAccess } from "./admin-access";
import { type AdminManagementPath, getAdminRouteAccess } from "./admin-route-registry";
import { useAdminSession } from "./admin-session";

export function AdminSessionBoundary() {
  const { capabilities } = useAdminSession();
  const permissions = useMemo(() => access({ capabilities }), [capabilities]);
  return (
    <AdminAccessContext.Provider value={permissions}>
      <Outlet />
    </AdminAccessContext.Provider>
  );
}

export function RequireCapability({ path }: { path: AdminManagementPath }) {
  const access = useAccess();
  const { currentUser, capabilities } = useAdminSession();
  const navigate = useNavigate();

  if (access[getAdminRouteAccess(path)]) return <Outlet />;
  if (currentUser && !capabilities?.visibleModules.length) return <Navigate to="/403" replace />;

  return (
    <Result
      status="403"
      title="403"
      subTitle="抱歉，你无权访问该页面"
      extra={
        <Button type="primary" onClick={() => void navigate("/")}>
          返回首页
        </Button>
      }
    />
  );
}
