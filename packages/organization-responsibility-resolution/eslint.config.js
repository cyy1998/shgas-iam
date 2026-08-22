import { createBackendConfig } from "@iam/eslint-config";

export default createBackendConfig({
  rules: {
    "node/prefer-global/process": "off",
  },
});
