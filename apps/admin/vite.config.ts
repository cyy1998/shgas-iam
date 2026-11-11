import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

const browserEnvKeys = [
  "IAM_ADMIN_WEB_API_PREFIX",
  "IAM_ADMIN_WEB_CLIENT_CODE",
  "IAM_ADMIN_WEB_GRAFANA_URL",
  "IAM_ADMIN_WEB_SSO_AUTHORIZE_URL",
  "IAM_ADMIN_WEB_SSO_LOGOUT_URL",
  "IAM_ADMIN_WEB_SYSTEM_LOG_ENV",
] as const;

const proxy: Record<string, ProxyOptions> = {};
for (const [port, paths] of [
  [30000, ["public", "open", "internal", "sso", "auth"]],
  [30001, ["admin", "rpc"]],
] as const) {
  for (const path of paths) {
    const target = `http://localhost:${port}`;
    proxy[`/${path}`] = { target, changeOrigin: true };
    proxy[`/api/iam/${path}`] = {
      target,
      changeOrigin: true,
      rewrite: (url) => url.replace(/^\/api\/iam/, ""),
    };
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, [...browserEnvKeys, "PORT"]);

  return {
    base: "/iam-admin/",
    plugins: [react()],
    resolve: { alias: { "@admin": resolve(import.meta.dirname, "src") } },
    envPrefix: [],
    define: Object.fromEntries(
      browserEnvKeys.map((key) => [`import.meta.env.${key}`, JSON.stringify(env[key]) ?? "undefined"]),
    ),
    server: {
      port: Number(env.PORT || 8001),
      strictPort: true,
      proxy,
    },
    build: {
      rolldownOptions: {
        output: {
          entryFileNames: "assets/[name].[hash:8].js",
          chunkFileNames: "assets/[name].[hash:8].js",
          assetFileNames: "assets/[name].[hash:8][extname]",
        },
      },
    },
  };
});
