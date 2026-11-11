import type { ComponentType } from "react";
import { Navigate, type RouteObject } from "react-router";
import AdminLayout from "./AdminLayout";
import { AdminSessionBoundary, RequireCapability } from "./AdminSessionBoundary";
import { ADMIN_MANAGEMENT_ROUTE_REGISTRY, type AdminManagementPath, HR_MANUAL_PATH } from "./admin-route-registry";
import { adminSessionRouteId, loadAdminSession } from "./admin-session";

function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  return async () => ({ Component: (await load()).default });
}

const managementPages = {
  "/users": { lazy: lazyPage(() => import("./pages/users")) },
  "/organizations": { lazy: lazyPage(() => import("./pages/organizations")) },
  "/organization-responsibilities": {
    element: <Navigate to="/organization-responsibilities/assignments" replace />,
  },
  "/organization-responsibilities/assignments": {
    lazy: lazyPage(() => import("./pages/organization-responsibilities/OrganizationResponsibilityAssignmentsPage")),
  },
  "/organization-responsibilities/types": {
    lazy: lazyPage(() => import("./pages/organization-responsibilities/OrganizationResponsibilityTypeCatalogPage")),
  },
  "/positions": { lazy: lazyPage(() => import("./pages/positions")) },
  "/employments": { lazy: lazyPage(() => import("./pages/employments")) },
  "/clients": { lazy: lazyPage(() => import("./pages/clients")) },
  "/clients/:clientCode/sso": { lazy: lazyPage(() => import("./pages/clients/ClientSsoPage")) },
  "/clients/:clientCode/edit": { lazy: lazyPage(() => import("./pages/clients/edit")) },
  "/roles": { lazy: lazyPage(() => import("./pages/roles")) },
  "/sessions": { lazy: lazyPage(() => import("./pages/sessions")) },
  "/delegations": { lazy: lazyPage(() => import("./pages/delegations")) },
  "/audit-logs": { lazy: lazyPage(() => import("./pages/audit-logs")) },
  "/system-logs": { lazy: lazyPage(() => import("./pages/system-logs")) },
} satisfies Record<AdminManagementPath, RouteObject>;

const managementRoutes: RouteObject[] = Object.keys(ADMIN_MANAGEMENT_ROUTE_REGISTRY).map((key) => {
  const path = key as AdminManagementPath;
  return {
    path,
    element: <RequireCapability path={path} />,
    children: [{ index: true, ...managementPages[path] }],
  };
});

export const adminRoutes: RouteObject[] = [
  {
    id: adminSessionRouteId,
    loader: loadAdminSession,
    shouldRevalidate: () => false,
    Component: AdminSessionBoundary,
    hydrateFallbackElement: <div />,
    children: [
      { path: HR_MANUAL_PATH, lazy: lazyPage(() => import("./pages/help/HrManualPage")) },
      {
        Component: AdminLayout,
        children: [
          { index: true, element: <Navigate to="/users" replace /> },
          ...managementRoutes,
          { path: "/403", lazy: lazyPage(() => import("./pages/403")) },
          { path: "*", element: <Navigate to="/403" replace /> },
        ],
      },
    ],
  },
];
