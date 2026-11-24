export type HybridNetwork = "bridge" | "host";
export type HybridLifecycle = "resident" | "fresh";

export interface HybridModes {
  network: HybridNetwork;
  lifecycle: HybridLifecycle;
  upstreamHost: string;
}

export function selectHybridModes(
  options: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; fresh?: boolean; lifecycle?: HybridLifecycle } = {},
): HybridModes {
  const { env = process.env, platform = process.platform } = options;
  const afk = Boolean(env.IAM_AFK_HOST_PROBE_URL);
  const network = afk || (platform !== "win32" && platform !== "darwin") ? "host" : "bridge";
  return {
    network,
    lifecycle: options.lifecycle ?? (options.fresh || afk || env.CI === "true" ? "fresh" : "resident"),
    upstreamHost: network === "host" ? "127.0.0.1" : env.IAM_E2E_UPSTREAM_HOST || "host.docker.internal",
  };
}

export interface HybridPorts {
  postgres: number;
  redis: number;
  etcd: number;
  http: number;
  https: number;
  admin: number;
}

export const apisixBuildContext = "e2e/system/docker/apisix";
export const e2eDatabaseName = "iam_e2e";
export const e2eDatabasePassword = "iam_e2e_local_password";
export const apisixAdminKey = "dev-local-admin-key-change-me";
export const apisixErrorLog = "/dev/shm/iam-e2e-apisix-error.log";

export function createHybridCompose(options: {
  network: HybridNetwork;
  ports: HybridPorts;
  project: string;
  buildContext?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const { network, ports, project, env = process.env } = options;
  const host = network === "host";
  const labels = {
    "com.shgas-iam.e2e.managed": "true",
    "com.shgas-iam.e2e.project": project,
  };
  return {
    services: {
      postgres: {
        image: env.IAM_E2E_POSTGRES_IMAGE || "docker.xuanyuan.run/postgres:18.4",
        labels,
        environment: {
          POSTGRES_USER: e2eDatabaseName,
          POSTGRES_DB: e2eDatabaseName,
          POSTGRES_PASSWORD: e2eDatabasePassword,
        },
        ports: [publish(ports.postgres, 5432)],
        volumes: ["postgres-data:/var/lib/postgresql"],
        healthcheck: healthcheck("pg_isready", "-h", "127.0.0.1", "-U", e2eDatabaseName, "-d", "postgres"),
      },
      redis: {
        image: env.IAM_E2E_REDIS_IMAGE || "docker.xuanyuan.run/library/redis:8.8.0",
        labels,
        ports: [publish(ports.redis, 6379)],
        volumes: ["redis-data:/data"],
        healthcheck: healthcheck("redis-cli", "ping"),
      },
      "apisix-etcd": {
        image: env.IAM_E2E_ETCD_IMAGE || "docker.xuanyuan.run/bitnamilegacy/etcd:3.5.11",
        labels,
        entrypoint: ["etcd"],
        command: [
          "--name=default",
          "--data-dir=/bitnami/etcd/data",
          "--advertise-client-urls=http://apisix-etcd:2379",
          "--listen-client-urls=http://0.0.0.0:2379",
          "--listen-peer-urls=http://0.0.0.0:2380",
          "--initial-advertise-peer-urls=http://apisix-etcd:2380",
          "--initial-cluster=default=http://apisix-etcd:2380",
        ],
        ...(host && { ports: [publish(ports.etcd, 2379)] }),
        volumes: ["etcd-data:/bitnami/etcd"],
        healthcheck: healthcheck("etcdctl", "endpoint", "health", "--endpoints=http://127.0.0.1:2379"),
      },
      apisix: {
        build: { context: options.buildContext ?? apisixBuildContext },
        labels,
        ...(host
          ? { network_mode: "host" }
          : { ports: [publish(ports.http, 9080), publish(ports.https, 9443), publish(ports.admin, 9180)] }),
        environment: {
          TZ: "UTC",
          ...(host && {
            IAM_E2E_APISIX_LISTEN_IP: "127.0.0.1",
            IAM_E2E_APISIX_HTTP_PORT: String(ports.http),
            IAM_E2E_APISIX_HTTPS_PORT: String(ports.https),
            IAM_E2E_APISIX_ADMIN_PORT: String(ports.admin),
            IAM_E2E_APISIX_ETCD_URL: `http://127.0.0.1:${ports.etcd}`,
          }),
        },
        depends_on: { "apisix-etcd": { condition: "service_healthy" } },
        healthcheck: healthcheck("apisix", "status"),
      },
    },
    networks: { default: { labels } },
    volumes: {
      "postgres-data": { labels },
      "redis-data": { labels },
      "etcd-data": { labels },
    },
  };
}

function publish(hostPort: number, containerPort: number) {
  return `127.0.0.1:${hostPort}:${containerPort}`;
}

function healthcheck(...command: string[]) {
  return { test: ["CMD", ...command], interval: "1s", timeout: "3s", retries: 40 };
}
