import { defineConfig } from "@iam/api-core/core/define-config";

export default defineConfig({
  prefix: "",
  version: "1.0.0",
  openapi: {
    enabled: (env) => env.nodeEnv !== "production",
    docEndpoint: "/doc",
  },
  tiers: [
    { name: "health", basePath: "/", title: "Health" },
    { name: "sso", title: "Custom SSO" },
    { name: "oidc", title: "OpenID Connect" },
  ],
});
