import {
  ADMIN_MANAGEMENT_ROUTE_REGISTRY,
  getAdminRouteAccess,
} from '../admin-route-registry';
import config from '../../.umirc';
import { describe, expect, it } from 'vitest';

type Route = {
  path?: string;
  access?: string;
  routes?: Route[];
};

function flatten(routes: Route[]): Route[] {
  return routes.flatMap((route) => [
    route,
    ...flatten(route.routes ?? []),
  ]);
}

describe('Admin route registry', () => {
  it('classifies every management route and default-denies unknown routes', () => {
    const routes = flatten((config.routes ?? []) as Route[]);
    const supportPaths = new Set(['/', '/403', '*']);
    const managementRoutes = routes.filter(
      route => route.path && !supportPaths.has(route.path),
    );

    for (const route of managementRoutes) {
      const path = route.path as keyof typeof ADMIN_MANAGEMENT_ROUTE_REGISTRY;
      expect(ADMIN_MANAGEMENT_ROUTE_REGISTRY[path], route.path).toBeDefined();
      expect(route.access, route.path).toBe(getAdminRouteAccess(path));
    }
    expect(new Set(managementRoutes.map(route => route.path))).toEqual(
      new Set(Object.keys(ADMIN_MANAGEMENT_ROUTE_REGISTRY)),
    );
    expect(routes.find(route => route.path === '*')).toMatchObject({
      redirect: '/403',
    });
  });
});
