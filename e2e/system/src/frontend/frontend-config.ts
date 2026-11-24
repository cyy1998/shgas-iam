import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export const frontendApps = ["admin", "sso"] as const;
export type FrontendApp = (typeof frontendApps)[number];

export const frontendPrefixes: Record<FrontendApp, string> = { admin: "/iam-admin", sso: "/portal" };

export interface FrontendOptions {
  repoRoot: string;
  adminClientCode?: string;
  environment?: Readonly<Record<string, string>>;
  hostEnvironment?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export function frontendEnvironment(app: FrontendApp, options: FrontendOptions): Record<string, string> {
  // Match the public build inputs of the E2E Compose stack.
  const defaults: Record<string, string> =
    app === "admin"
      ? {
          IAM_ADMIN_WEB_API_PREFIX: "/api/iam",
          IAM_ADMIN_WEB_SSO_AUTHORIZE_URL: "/sso/authorize",
          IAM_ADMIN_WEB_SSO_LOGOUT_URL: "/sso/logout",
          IAM_ADMIN_WEB_CLIENT_CODE: options.adminClientCode ?? "iam-admin",
          IAM_ADMIN_WEB_GRAFANA_URL: "",
          IAM_ADMIN_WEB_SYSTEM_LOG_ENV: "e2e",
        }
      : {
          IAM_SSO_WEB_API_PREFIX: "/api/iam",
          IAM_SSO_WEB_CLIENT_CODE: "iam",
          IAM_SSO_WEB_CAP_SITE_KEY: "iam-sso",
          IAM_SSO_WEB_CAP_ENDPOINT: "/api/iam/open/cap/iam-sso/",
          IAM_SSO_WEB_CAP_WASM_URL: "/portal/cap/cap_wasm_bg.wasm",
          IAM_SSO_WEB_CAP_PAKO_URL: "/portal/cap/pako_inflate.min.js",
          IAM_SSO_WEB_LOGIN_CREDENTIAL_KID: "2026-05-primary",
          IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY:
            "04112ddd8854e8262db2520bba112535844884c03348a45fcf4ee0f9a967979be52bd46caf43be697ae557ed2e4fa5b4dca8d2dbfa08c0f2f710c0f61591bb17dc",
          IAM_SSO_WEB_WELL_KNOWN_URL: "/sso/.well-known/authentication-configuration",
        };
  const prefix = `IAM_${app.toUpperCase()}_WEB_`;
  const overrides = Object.entries(options.environment ?? {}).filter(([key]) => key.startsWith(prefix));
  return { ...defaults, ...Object.fromEntries(overrides) };
}

export function frontendCacheRoot(repoRoot: string) {
  return join(repoRoot, "e2e", "system", ".cache", "frontend");
}

export function vitePackageRoot(appRoot: string) {
  const requireFromApp = createRequire(join(appRoot, "package.json"));
  return dirname(requireFromApp.resolve("vite/package.json"));
}
