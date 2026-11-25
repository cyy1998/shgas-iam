import { createRoute, z } from "@hono/zod-openapi";
import { createRouter } from "@iam/api-core/core/create-router";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import { OK, SERVICE_UNAVAILABLE } from "@iam/contracts/http";

const responses = {
  [OK]: jsonContent(z.object({ status: z.literal("ok") }), "Available"),
  [SERVICE_UNAVAILABLE]: jsonContent(z.object({ status: z.literal("unavailable") }), "Unavailable"),
};

export function createProbeRoutes(verifyRedis: () => Promise<unknown>, verifyDatabase: () => Promise<unknown>) {
  const router = createRouter();
  const health = createRoute({ method: "get", path: "/health", summary: "Redis liveness", responses });
  const ready = createRoute({ method: "get", path: "/ready", summary: "Redis and PostgreSQL readiness", responses });

  return router
    .openapi(health, async (c) => {
      try {
        await verifyRedis();
        return c.json({ status: "ok" }, OK);
      } catch {
        return c.json({ status: "unavailable" }, SERVICE_UNAVAILABLE);
      }
    })
    .openapi(ready, async (c) => {
      try {
        await Promise.all([verifyRedis(), verifyDatabase()]);
        return c.json({ status: "ok" }, OK);
      } catch {
        return c.json({ status: "unavailable" }, SERVICE_UNAVAILABLE);
      }
    });
}
