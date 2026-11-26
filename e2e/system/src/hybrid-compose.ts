import { createE2EMiddlewareCompose } from "./middleware-compose.ts";

export type HybridLifecycle = "resident" | "fresh";

export function selectHybridLifecycle(
  options: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; fresh?: boolean; lifecycle?: HybridLifecycle } = {},
): HybridLifecycle {
  const { env = process.env, platform = process.platform } = options;
  if (platform !== "linux") {
    throw new Error(`Hybrid E2E requires Linux (native Linux or WSL2). Current platform: ${platform}`);
  }

  const afk = Boolean(env.IAM_AFK_HOST_PROBE_URL);
  return options.lifecycle ?? (options.fresh || afk || env.CI === "true" ? "fresh" : "resident");
}

export interface HybridPorts {
  postgres: number;
  redis: number;
  etcd: number;
  http: number;
  https: number;
  admin: number;
}

export const hybridUpstreamHost = "127.0.0.1";

export function createHybridCompose(options: {
  ports: HybridPorts;
  project: string;
  buildContext?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const { ports } = options;
  const infrastructure = createE2EMiddlewareCompose(options);
  const { services } = infrastructure;
  return {
    ...infrastructure,
    services: {
      postgres: { ...services.postgres, ports: [publish(ports.postgres, 5432)] },
      redis: { ...services.redis, ports: [publish(ports.redis, 6379)] },
      "apisix-etcd": { ...services["apisix-etcd"], ports: [publish(ports.etcd, 2379)] },
      apisix: {
        ...services.apisix,
        network_mode: "host",
        environment: {
          ...services.apisix.environment,
          IAM_E2E_APISIX_LISTEN_IP: hybridUpstreamHost,
          IAM_E2E_APISIX_HTTP_PORT: String(ports.http),
          IAM_E2E_APISIX_HTTPS_PORT: String(ports.https),
          IAM_E2E_APISIX_ADMIN_PORT: String(ports.admin),
          IAM_E2E_APISIX_ETCD_URL: `http://${hybridUpstreamHost}:${ports.etcd}`,
        },
      },
    },
  };
}

function publish(hostPort: number, containerPort: number) {
  return `${hybridUpstreamHost}:${hostPort}:${containerPort}`;
}
