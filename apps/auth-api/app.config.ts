import { defineConfig } from "@iam/api-core/core/define-config";

export default defineConfig({
  prefix: "",
  version: "1.0.0",
  openapi: { enabled: (env) => env.nodeEnv !== "production" },
  tiers: [
    { name: "health", basePath: "/", title: "Auth API probes" },
    { name: "auth", title: "身份认证与账号自助" },
    { name: "sso", title: "第三方登录回调" },
  ],
});
