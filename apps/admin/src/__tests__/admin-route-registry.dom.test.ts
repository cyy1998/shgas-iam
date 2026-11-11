import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { hrAdminCapabilitySummary } from "~admin/test/mocks/fixtures";
import access from "../access";
import {
  ADMIN_MANAGEMENT_ROUTE_REGISTRY,
  type AdminManagementPath,
  getAdminRouteAccess,
  HR_MANUAL_PATH,
} from "../admin-route-registry";
import { adminRoutes } from "../routes";

function flatten(routes: RouteObject[]): RouteObject[] {
  return routes.flatMap((route) => [route, ...flatten(route.children ?? [])]);
}

describe("Admin route registry", () => {
  it("classifies every management route", () => {
    const routes = flatten(adminRoutes);
    const supportPaths = new Set(["/", "/403", "*", HR_MANUAL_PATH]);
    const managementRoutes = routes.filter((route) => route.path && !supportPaths.has(route.path));

    expect(new Set(managementRoutes.map((route) => route.path))).toEqual(
      new Set(Object.keys(ADMIN_MANAGEMENT_ROUTE_REGISTRY)),
    );
  });

  it("applies scoped module capabilities to every registered route without granting collection writes", () => {
    const permissions = access({ capabilities: hrAdminCapabilitySummary });
    const routePermissions = new Map(Object.entries(permissions));
    const allowedPaths = new Set([
      "/users",
      "/organizations",
      "/organization-responsibilities",
      "/organization-responsibilities/assignments",
      "/organization-responsibilities/types",
      "/positions",
      "/employments",
    ]);
    for (const path of Object.keys(ADMIN_MANAGEMENT_ROUTE_REGISTRY) as AdminManagementPath[]) {
      expect(routePermissions.get(getAdminRouteAccess(path)), path).toBe(allowedPaths.has(path));
    }
    expect(permissions.canCreateEmployment).toBe(true);
    for (const action of [
      "canCreateUser",
      "canCreateOrganizationRoot",
      "canCreateOrganizationResponsibility",
      "canCreatePosition",
      "canEditPosition",
      "canChangePositionStatus",
      "canDeletePosition",
      "canCreateDelegation",
    ] as const)
      expect(permissions[action], action).toBe(false);
  });

  it("denies every protected route and collection action before capabilities are available", () => {
    const permissions = access({});
    expect(Object.values(permissions).every((allowed) => allowed === false)).toBe(true);
  });
});
