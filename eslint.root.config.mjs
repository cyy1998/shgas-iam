import antfu from "@antfu/eslint-config";

export default antfu({
  formatters: true,
  typescript: true,
  stylistic: {
    semi: true,
    quotes: "double",
  },
  rules: {
    "no-console": "off",
    "node/prefer-global/process": "off",
    "ts/consistent-type-definitions": "off",
    "max-len": [
      "warn",
      {
        code: 120,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
        ignoreUrls: true,
      },
    ],
  },
});
