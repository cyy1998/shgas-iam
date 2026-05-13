import { defineConfig } from "@iam/api-core/core";

export default defineConfig({
  prefix: "",
  version: "1.0.0",
  openapi: {
    enabled: env => env.NODE_ENV !== "production",
    docEndpoint: "/doc",
    scalar: {
      theme: "elysiajs",
      layout: "modern",
      defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
      cdn: "/static/scalar/api-reference.js",
    },
  },
  tiers: [
    { name: "admin", title: "管理端API" },
    { name: "rpc", title: "管理端RPC API", routeDir: "trpc" },
  ],
});
