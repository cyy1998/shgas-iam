import { defineConfig } from "@api/lib/core/define-config";

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
    { name: "public", title: "通用用户API" },
    { name: "open", title: "公开API" },
    { name: "admin", title: "管理端API" },
    { name: "internal", title: "内部API" },
    { name: "sso", title: "单点登录API" },
    { name: "auth", title: "认证API" },
    { name: "rpc", title: "RPC API", routeDir: "trpc" },
  ],
});
