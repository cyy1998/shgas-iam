import { createServiceBackendConfig } from "@iam/eslint-config";

export default createServiceBackendConfig({
  ignores: [
    "src/db/generated",
    "scripts/**",
  ],
});
