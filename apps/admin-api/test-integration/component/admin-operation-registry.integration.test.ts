import { createAdminApiRouteComposition } from "@admin-api/composition/routes";
import { ADMIN_OPERATION_REGISTRY, ADMIN_REST_ONLY_OPERATION_IDS } from "@admin-api/services/admin-authorization/admin-operation.registry";
import { createAdminRestOperationSurface } from "@admin-api/services/admin-authorization/admin-rest-operation.surface";
import { createAdminTrpcOperationSurface } from "@admin-api/services/admin-authorization/admin-trpc-operation.surface";
import { createRouter } from "@iam/api-core/core/create-router";
import { expect, test } from "bun:test";

const adminTier = { name: "admin", title: "Admin API" };

function createProductionMountedSurfaces() {
  return createAdminApiRouteComposition({
    auditService: {},
    runtime: { random: {} },
    services: {
      client: {},
      clientSso: { service: {} },
      employment: {},
      organization: {},
      organizationResponsibility: {},
      position: {},
      role: {},
      sessionManagement: {},
      user: {},
    },
    useCases: {
      employment: {
        changeEmploymentAvailability: {},
        createEmployment: {},
        endEmployment: {},
        managePrimaryEmployment: {},
        resignUser: {},
        transferEmployment: {},
      },
      organizationResponsibility: {
        createAssignment: {},
        manageAssignmentLifecycle: {},
      },
    },
  } as never);
}

test("classifies every production-mounted Admin REST endpoint exactly once", () => {
  const { restOperationSurface } = createProductionMountedSurfaces();

  expect(restOperationSurface.endpoints).toHaveLength(73);
  expect<string[]>([
    ...new Set(
      restOperationSurface.endpoints.map(endpoint => endpoint.operationId),
    ),
  ].sort()).toEqual(Object.keys(ADMIN_OPERATION_REGISTRY).sort());
});

test("fails closed when production mounts an unclassified Admin REST endpoint", () => {
  const { routes } = createProductionMountedSurfaces();
  const unclassifiedRoute = createRouter().get("/unclassified", c => c.text("no"));

  expect(() => createAdminRestOperationSurface({
    ...routes,
    "./src/routes/admin/unclassified/index.ts": {
      default: unclassifiedRoute as never,
    },
  }, adminTier)).toThrow(
    "Admin REST endpoint GET /unclassified must have exactly one classified operation",
  );
});

test("fails closed for an unclassified Admin REST endpoint using a Windows module path", () => {
  const { routes } = createProductionMountedSurfaces();
  const unclassifiedRoute = createRouter().get("/unclassified", c => c.text("no"));

  expect(() => createAdminRestOperationSurface({
    ...routes,
    ".\\src\\routes\\admin\\unclassified\\index.ts": {
      default: unclassifiedRoute as never,
    },
  }, adminTier)).toThrow(
    "Admin REST endpoint GET /unclassified must have exactly one classified operation",
  );
});

test("uses the production tier routeDir when guarding Admin REST endpoints", () => {
  const { routes } = createProductionMountedSurfaces();
  const unclassifiedRoute = createRouter().get("/unclassified", c => c.text("no"));

  expect(() => createAdminRestOperationSurface({
    ...routes,
    "./src/routes/privileged/unclassified/index.ts": {
      default: unclassifiedRoute as never,
    },
  }, {
    ...adminTier,
    routeDir: "privileged",
  })).toThrow(
    "Admin REST endpoint GET /unclassified must have exactly one classified operation",
  );
});

test("uses the production tier explicit routes when guarding Admin REST endpoints", () => {
  const { routes } = createProductionMountedSurfaces();
  const unclassifiedRoute = createRouter().get("/unclassified", c => c.text("no"));

  expect(() => createAdminRestOperationSurface(routes, {
    ...adminTier,
    routes: {
      virtualAdminRoute: { default: unclassifiedRoute as never },
    },
  })).toThrow(
    "Admin REST endpoint GET /unclassified must have exactly one classified operation",
  );
});

test("classifies every production-mounted Admin tRPC procedure and excludes REST-only operations", () => {
  const { trpcOperationSurface } = createProductionMountedSurfaces();
  const procedureIds = trpcOperationSurface.procedures.map(
    procedure => procedure.operationId,
  );
  const restOnly = new Set<string>(ADMIN_REST_ONLY_OPERATION_IDS);
  const expected = Object.keys(ADMIN_OPERATION_REGISTRY).filter(
    id => !restOnly.has(id),
  );

  expect(procedureIds).toHaveLength(70);
  expect([...new Set<string>(procedureIds)].sort()).toEqual(expected.sort());
});

test("fails closed when the production app router gains an unclassified sibling procedure", () => {
  const { appRouter } = createProductionMountedSurfaces();

  expect(() => createAdminTrpcOperationSurface({
    _def: {
      procedures: {
        ...appRouter._def.procedures,
        "reports.export": {},
      },
    },
  })).toThrow(
    "Admin tRPC procedure reports.export must have the matching classified operation",
  );
});
