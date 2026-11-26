export const apisixBuildContext = "e2e/system/docker/apisix";
export const e2eDatabaseName = "iam_e2e";
export const e2eDatabasePassword = "iam_e2e_local_password";
export const apisixAdminKey = "dev-local-admin-key-change-me";
export const apisixErrorLog = "/dev/shm/iam-e2e-apisix-error.log";

export function createE2EMiddlewareCompose(options: {
  project: string;
  buildContext?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const { project, env = process.env } = options;
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
        command: [
          "postgres",
          "-c",
          "fsync=off",
          "-c",
          "synchronous_commit=off",
          "-c",
          "full_page_writes=off",
          "-c",
          "max_wal_size=2GB",
          "-c",
          "checkpoint_timeout=15min",
        ],
        tmpfs: ["/var/lib/postgresql:size=1g"],
        healthcheck: healthcheck("pg_isready", "-h", "127.0.0.1", "-U", e2eDatabaseName, "-d", "postgres"),
      },
      redis: {
        image: env.IAM_E2E_REDIS_IMAGE || "docker.xuanyuan.run/library/redis:8.8.0",
        labels,
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
        volumes: ["etcd-data:/bitnami/etcd"],
        healthcheck: healthcheck("etcdctl", "endpoint", "health", "--endpoints=http://127.0.0.1:2379"),
      },
      apisix: {
        build: { context: options.buildContext ?? apisixBuildContext },
        labels,
        environment: { TZ: "UTC" },
        depends_on: { "apisix-etcd": { condition: "service_healthy" } },
        healthcheck: healthcheck("apisix", "status"),
      },
    },
    networks: { default: { labels } },
    volumes: {
      "redis-data": { labels },
      "etcd-data": { labels },
    },
  };
}

function healthcheck(...command: string[]) {
  return { test: ["CMD", ...command], interval: "1s", timeout: "3s", retries: 40 };
}
