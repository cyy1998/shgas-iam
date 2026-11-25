import { createRoute, z } from "@hono/zod-openapi";
import { createRouter } from "@iam/api-core/core/create-router";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { ok } from "@iam/api-core/http";
import { verifyInternalClient } from "@iam/api-core/middlewares/internal-client-authentication";
import { HttpStatusCodes } from "@iam/contracts/http";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import { SystemLogEvent } from "@iam/runtime/logger";
import type { Logger } from "pino";

export const internalClientSecurity = [{ InternalApiSecret: [] }];

const internalAuthz = createRoute({
  method: "get",
  path: "/authz",
  tags: ["Internal/Authz"],
  security: internalClientSecurity,
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "准许"),
  },
});

export function createInternalAuthzRoute(
  getClientBySecret: (secret: string) => Promise<GenericClientRuntimeDto | null>,
  logger: Pick<Logger, "info">,
) {
  const router = createRouter().basePath("/internal");
  router.openAPIRegistry.registerComponent("securitySchemes", "InternalApiSecret", {
    type: "apiKey",
    in: "header",
    name: "apikey",
  });
  return router.openapi(internalAuthz, async (c) => {
    logger.info(
      {
        event: SystemLogEvent.InternalAuthzChecked,
        requestId: c.get("requestId"),
        sourceIp: c.req.header("IP-Chain"),
        hasClientSecret: c.req.header("apikey") !== undefined,
      },
      "internal authorization checked",
    );
    await verifyInternalClient(c, { getClientBySecret });
    return c.json(ok(true), HttpStatusCodes.OK);
  });
}
