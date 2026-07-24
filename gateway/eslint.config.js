import { createBackendConfig } from "@iam/eslint-config";

export default createBackendConfig({
  rules: {
    "no-console": "off",
    "no-template-curly-in-string": "off",
    "node/prefer-global/process": "off",
    "regexp/no-dupe-disjunctions": "off",
    "regexp/prefer-w": "off",
    "unicorn/prefer-type-error": "off",
  },
});
