import {
  BAD_REQUEST,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
  REQUEST_TOO_LONG,
  SERVICE_UNAVAILABLE,
  UNAUTHORIZED,
  UNSUPPORTED_MEDIA_TYPE,
} from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { Hono } from "hono";
import { GatewayError } from "../services/gateway/gateway.error";
import { gatewayApplyInputSchema, gatewayInputSchema } from "../services/gateway/gateway.schema";
import type { GatewayService } from "../services/gateway/gateway.service";
import { createGatewayLifecycle, type GatewayLifecycle } from "./lifecycle";

export function createGatewayApp(input: {
  service: GatewayService;
  maxRequestBytes?: number;
  lifecycle?: GatewayLifecycle;
}) {
  const app = new Hono();
  const lifecycle = input.lifecycle ?? createGatewayLifecycle();
  app.use("*", async (c, next) => {
    if (c.req.path === "/health") return await next();
    return await lifecycle.run(next);
  });
  app.onError((error, c) => {
    if (error instanceof GatewayError) return c.json(resp.fail(error.code, error.message, error.data), error.status);
    return c.json(resp.fail("GATEWAY_INTERNAL_ERROR", "Gateway operation failed"), INTERNAL_SERVER_ERROR);
  });
  app.notFound((c) => c.json(resp.fail("GATEWAY_NOT_FOUND", "Gateway endpoint not found"), NOT_FOUND));
  app.get("/health", (c) =>
    lifecycle.closing
      ? c.json(resp.fail("GATEWAY_STOPPING", "Gateway is shutting down"), SERVICE_UNAVAILABLE)
      : c.json(resp.ok({ status: "ready" })),
  );
  for (const operation of ["validate", "diff", "apply"] as const)
    app.post(`/${operation}`, async (c) => {
      const secret = c.req.header("apikey");
      if (!secret) throw new GatewayError("GATEWAY_UNAUTHORIZED", "Client authentication failed", UNAUTHORIZED);
      if (c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
        throw new GatewayError(
          "GATEWAY_INPUT_INVALID",
          "Content-Type must be application/json",
          UNSUPPORTED_MEDIA_TYPE,
        );
      }
      const body = await readJson(c.req.raw, input.maxRequestBytes ?? 1_048_576);
      if (operation === "apply") {
        const parsed = gatewayApplyInputSchema.safeParse(body);
        if (!parsed.success)
          throw new GatewayError(
            "GATEWAY_INPUT_INVALID",
            "Expected scope, yaml, optional string variables and boolean apply options",
            BAD_REQUEST,
          );
        return c.json(resp.ok(await input.service.apply(parsed.data, secret)));
      }
      const parsed = gatewayInputSchema.safeParse(body);
      if (!parsed.success)
        throw new GatewayError(
          "GATEWAY_INPUT_INVALID",
          "Expected scope, yaml and optional string variables",
          BAD_REQUEST,
        );
      return c.json(resp.ok(await input.service[operation](parsed.data, secret)));
    });
  return app;
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new GatewayError("GATEWAY_INPUT_INVALID", "A JSON request body is required", BAD_REQUEST);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new GatewayError(
          "GATEWAY_INPUT_TOO_LARGE",
          "Request body exceeds the configured limit",
          REQUEST_TOO_LONG,
        );
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError("GATEWAY_INPUT_INVALID", "A valid JSON request body is required", BAD_REQUEST);
  } finally {
    reader.releaseLock();
  }
}
