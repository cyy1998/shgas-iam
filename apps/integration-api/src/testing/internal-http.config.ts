import { defineConfig } from "@iam/api-core/core/define-config";

export default defineConfig({
  prefix: "",
  tiers: [{ name: "internal", title: "内部API" }],
});
