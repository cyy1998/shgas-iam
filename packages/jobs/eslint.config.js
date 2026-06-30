import antfu from "@antfu/eslint-config";

export default antfu({
  formatters: true,
  stylistic: {
    semi: true,
    quotes: "double",
  },
  rules: {
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
