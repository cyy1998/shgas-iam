import { z } from "zod";
import type { EnvMap } from "./types";

const RawEnvSchema = z.object({
  IAM_GATEWAY_DATABASE_URL: z
    .string()
    .url()
    .refine((value) => validStartupUrl(value, ["postgres:", "postgresql:"])),
  IAM_GATEWAY_APISIX_ADMIN_URL: z
    .string()
    .url()
    .refine((value) => {
      if (!validStartupUrl(value, ["http:", "https:"])) return false;
      const url = new URL(value);
      return !url.username && !url.password && !url.search && !url.hash;
    }),
  IAM_GATEWAY_APISIX_ADMIN_KEY: z.string().min(1),
  IAM_GATEWAY_HOSTNAME: z
    .string()
    .min(1)
    .regex(/^[^\s/]+$/)
    .default("0.0.0.0"),
  IAM_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(30004),
  IAM_GATEWAY_MAX_REQUEST_BYTES: z.coerce.number().int().min(1).max(16_777_216).default(1_048_576),
  IAM_GATEWAY_OPERATION_TIMEOUT_MS: z.coerce.number().int().min(1).max(240_000).default(60_000),
  IAM_GATEWAY_APISIX_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1).max(240_000).default(10_000),
  IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(70_000),
});

export function parseGatewayEnv(source: NodeJS.ProcessEnv = process.env) {
  const result = RawEnvSchema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid Gateway startup configuration: ${fields.join(", ")}`);
  }
  const raw = result.data;
  if (
    raw.IAM_GATEWAY_APISIX_REQUEST_TIMEOUT_MS > raw.IAM_GATEWAY_OPERATION_TIMEOUT_MS ||
    raw.IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS <= raw.IAM_GATEWAY_OPERATION_TIMEOUT_MS
  ) {
    throw new Error(
      "IAM_GATEWAY_APISIX_REQUEST_TIMEOUT_MS must not exceed IAM_GATEWAY_OPERATION_TIMEOUT_MS; IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS must exceed it",
    );
  }
  return {
    databaseUrl: raw.IAM_GATEWAY_DATABASE_URL,
    apisixAdminUrl: raw.IAM_GATEWAY_APISIX_ADMIN_URL,
    apisixAdminKey: raw.IAM_GATEWAY_APISIX_ADMIN_KEY,
    hostname: raw.IAM_GATEWAY_HOSTNAME,
    port: raw.IAM_GATEWAY_PORT,
    maxRequestBytes: raw.IAM_GATEWAY_MAX_REQUEST_BYTES,
    operationTimeoutMs: raw.IAM_GATEWAY_OPERATION_TIMEOUT_MS,
    apisixRequestTimeoutMs: raw.IAM_GATEWAY_APISIX_REQUEST_TIMEOUT_MS,
    shutdownTimeoutMs: raw.IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS,
  };
}

export type GatewayEnv = ReturnType<typeof parseGatewayEnv>;

function validStartupUrl(value: string, protocols: string[]) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function renderEnvPlaceholders(content: string, env: EnvMap, source = "manifest"): string {
  return content.replace(/\$\{([A-Z0-9_]+)\}/g, (_placeholder, name: string) => {
    const value = env[name];
    if (value === undefined) {
      throw new Error(`${source} references missing environment variable ${name}`);
    }
    return value;
  });
}

export function renderEnvValue(value: unknown, env: EnvMap, source: string): unknown {
  if (typeof value === "string") {
    return renderEnvPlaceholders(value, env, source);
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderEnvValue(item, env, source));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      renderEnvPlaceholders(key, env, source),
      renderEnvValue(child, env, source),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
