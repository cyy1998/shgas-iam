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
    // "ts/consistent-type-definitions": ["error", "type"],
    "max-len": [
      "warn", // 超过限制时发出警告，也可以设为 "error"
      {
        code: 120, // 设置最大长度为120
        ignoreStrings: true, // 忽略字符串
        ignoreTemplateLiterals: true, // 忽略模板字符串
        ignoreRegExpLiterals: true, // 忽略正则
        ignoreUrls: true, // 忽略URL
      },
    ],
  },
  ignores: [
    "src/db/generated",
  ],
});
