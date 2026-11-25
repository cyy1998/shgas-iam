import { defineConfig } from "@iam/api-core/core/define-config";

export default defineConfig({
  version: "1.0.0",
  openapi: { enabled: (env) => env.nodeEnv !== "production" },
  tiers: [{ name: "integration", basePath: "/", title: "IAM Integration API" }],
});
