import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { portalBase } from "./src/constants/paths";

const publicEnvKeys = [
  "IAM_SSO_WEB_API_PREFIX",
  "IAM_SSO_WEB_CLIENT_CODE",
  "IAM_SSO_WEB_CAP_SITE_KEY",
  "IAM_SSO_WEB_CAP_ENDPOINT",
  "IAM_SSO_WEB_CAP_WASM_URL",
  "IAM_SSO_WEB_CAP_PAKO_URL",
  "IAM_SSO_WEB_LOGIN_CREDENTIAL_KID",
  "IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY",
  "IAM_SSO_WEB_WELL_KNOWN_URL",
];

const apiTarget = { target: "http://localhost:30000", changeOrigin: true };

const redirectPortalBase: Plugin = {
  name: "sso-portal-redirect",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split("?", 1)[0] !== portalBase) return next();
      response.writeHead(301, { Location: `${portalBase}/` });
      response.end();
    });
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, ["IAM_SSO_WEB_", "PORT"]);

  return {
    base: `${portalBase}/`,
    plugins: [redirectPortalBase, react()],
    resolve: {
      alias: { "@sso": resolve(import.meta.dirname, "src") },
    },
    envPrefix: [],
    define: Object.fromEntries(
      publicEnvKeys.map((key) => [`import.meta.env.${key}`, JSON.stringify(env[key]) ?? "undefined"]),
    ),
    server: {
      port: Number(env.PORT) || 8000,
      proxy: {
        "^/api/iam/(public|open|internal|sso|auth)": {
          ...apiTarget,
          rewrite: (path) => path.replace(/^\/api\/iam/, ""),
        },
        "/api": apiTarget,
        "/sso": apiTarget,
        "/auth": apiTarget,
        "/public": apiTarget,
        "/open": apiTarget,
        "/internal": apiTarget,
      },
    },
  };
});
