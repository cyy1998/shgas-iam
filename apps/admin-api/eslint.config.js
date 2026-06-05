import antfu from "@antfu/eslint-config";

export default antfu({
  formatters: true,
  stylistic: {
    semi: true,
    quotes: "double",
  },
  rules: {
    "no-console": "warn",
    "node/prefer-global/process": "off",
    "node/prefer-global/buffer": "off",
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
  ignores: [
    "scripts/**",
  ],
});
