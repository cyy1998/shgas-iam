import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ApisixAdminClient } from "../apisix-admin-client";
import type { GatewayEnv } from "../env";
import { createGatewayApp } from "../http/app";
import { createGatewayLifecycle } from "../http/lifecycle";
import { createClientCredentialReader } from "../repositories/client-credential.repository";
import { createGatewayService } from "../services/gateway/gateway.service";

export function createGatewayComposition(env: GatewayEnv) {
  const sql = postgres(env.databaseUrl, {
    max: 4,
    connect_timeout: Math.max(1, Math.ceil(Math.min(env.operationTimeoutMs, 10_000) / 1000)),
    idle_timeout: 20,
    connection: {
      application_name: "iam-gateway",
      default_transaction_read_only: true,
      statement_timeout: Math.min(env.operationTimeoutMs, 10_000),
    },
  });
  const db = drizzle({ client: sql, relations });
  const remote = new ApisixAdminClient({
    adminUrl: env.apisixAdminUrl,
    adminKey: env.apisixAdminKey,
    requestTimeoutMs: env.apisixRequestTimeoutMs,
  });
  const service = createGatewayService({
    credentials: createClientCredentialReader(db),
    operationTimeoutMs: env.operationTimeoutMs,
    remote,
    writer: remote,
  });
  const lifecycle = createGatewayLifecycle();
  const app = createGatewayApp({ service, maxRequestBytes: env.maxRequestBytes, lifecycle });
  let closing: Promise<void> | undefined;
  return {
    app,
    service,
    lifecycle,
    close() {
      lifecycle.beginShutdown();
      closing ??= (async () => {
        await lifecycle.drain();
        await sql.end({ timeout: 5 });
      })();
      return closing;
    },
  };
}
