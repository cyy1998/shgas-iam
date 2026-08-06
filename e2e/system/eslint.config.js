import { createBackendConfig } from "@iam/eslint-config";

export default createBackendConfig({
  rules: {
    "no-console": "off",
    "node/prefer-global/process": "off",
  },
});
