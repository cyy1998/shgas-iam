import { describe, expect, it } from "vitest";
import { hrAdminCapabilitySummary } from "~admin/test/mocks/fixtures";
import config from "../../.umirc";
import access from "../access";
import { ADMIN_MANAGEMENT_ROUTE_REGISTRY, getAdminRouteAccess } from "../admin-route-registry";

type Route = {
  path?: string;
  access?: string;
  routes?: Route[];
};

function flatten(routes: Route[]): Route[] {
  return routes.flatMap((route) => [route, ...flatten(route.routes ?? [])]);
}

describe("Admin route registry", () => {
  it("classifies every management route and default-denies unknown routes", () => {
    const routes = flatten((config.routes ?? []) as Route[]);
    const supportPaths = new Set(["/", "/403", "*"]);
    const managementRoutes = routes.filter((route) => route.path && !supportPaths.has(route.path));

    for (const route of managementRoutes) {
      const path = route.path as keyof typeof ADMIN_MANAGEMENT_ROUTE_REGISTRY;
      expect(ADMIN_MANAGEMENT_ROUTE_REGISTRY[path], route.path).toBeDefined();
      expect(route.access, route.path).toBe(getAdminRouteAccess(path));
    }
    expect(new Set(managementRoutes.map((route) => route.path))).toEqual(
      new Set(Object.keys(ADMIN_MANAGEMENT_ROUTE_REGISTRY)),
    );
    expect(routes.find((route) => route.path === "*")).toMatchObject({
      redirect: "/403",
    });
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
    const routes = flatten((config.routes ?? []) as Route[]);
    const managementRoutes = routes.filter((route) => route.access);
    for (const route of managementRoutes) {
      if (!route.path || !route.access) throw new Error("Protected routes need an explicit path and access key");
      expect(routePermissions.get(route.access), route.path).toBe(allowedPaths.has(route.path));
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
