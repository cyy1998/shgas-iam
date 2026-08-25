import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { TierConfig } from "@iam/api-core/core/define-config";
import type { AdminOperationId } from "./admin-operation.registry";
import { getAdminOperationId } from "@admin-api/lib/admin-api-adapter";
import { resolveTierRoutes } from "@iam/api-core/core/create-app";
import { ADMIN_OPERATION_REGISTRY } from "./admin-operation.registry";

interface AdminRestEndpoint {
  method: string;
  operationId: AdminOperationId;
  path: string;
}

export function createAdminRestOperationSurface(
  routes: CreateAppOptions["routes"],
  tier: TierConfig,
) {
  const groupedHandlers = new Map<string, unknown[]>();
  const mountedRoutes = resolveTierRoutes(tier, routes);
  for (const module of Object.values(mountedRoutes)) {
    for (const route of module.default.routes) {
      const key = `${route.method.toUpperCase()} ${route.path}`;
      groupedHandlers.set(key, [
        ...(groupedHandlers.get(key) ?? []),
        route.handler,
      ]);
    }
  }

  const endpoints: AdminRestEndpoint[] = [];
  for (const [key, handlers] of groupedHandlers) {
    const operationIds = handlers
      .map(getAdminOperationId)
      .filter(operationId => operationId !== null);
    if (operationIds.length !== 1) {
      throw new Error(
        `Admin REST endpoint ${key} must have exactly one classified operation`,
      );
    }
    const separator = key.indexOf(" ");
    endpoints.push({
      method: key.slice(0, separator),
      operationId: operationIds[0]!,
      path: key.slice(separator + 1),
    });
  }

  const mountedOperationIds = [...new Set(
    endpoints.map(endpoint => endpoint.operationId),
  )].sort();
  const registeredOperationIds = Object.keys(ADMIN_OPERATION_REGISTRY).sort();
  if (mountedOperationIds.join("\n") !== registeredOperationIds.join("\n")) {
    throw new Error(
      "Admin REST mounted operations must exactly match the closed registry",
    );
  }

  return {
    endpoints,
    match(method: string, path: string) {
      const normalizedMethod = method.toUpperCase() === "HEAD"
        ? "GET"
        : method.toUpperCase();
      for (const endpoint of endpoints) {
        if (endpoint.method !== normalizedMethod)
          continue;
        const params = matchPath(endpoint.path, path);
        if (params)
          return { ...endpoint, params };
      }
      return null;
    },
  };
}

function matchPath(pattern: string, actual: string) {
  const patternSegments = splitPath(pattern);
  const actualSegments = splitPath(actual);
  if (patternSegments.length !== actualSegments.length)
    return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index]!;
    const actualSegment = actualSegments[index]!;
    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodePathSegment(actualSegment);
      continue;
    }
    if (patternSegment !== actualSegment)
      return null;
  }
  return params;
}

function splitPath(path: string) {
  return path.split("/").filter(Boolean);
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  }
  catch {
    return value;
  }
}

export type AdminRestOperationSurface = ReturnType<
  typeof createAdminRestOperationSurface
>;
