import antfu from "@antfu/eslint-config";

export default antfu({
  formatters: true,
  stylistic: {
    semi: true,
    quotes: "double",
  },
  rules: {
    "no-console": "off",
    "no-template-curly-in-string": "off",
    "node/prefer-global/process": "off",
    "regexp/no-dupe-disjunctions": "off",
    "regexp/prefer-w": "off",
    "unicorn/prefer-type-error": "off",
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
