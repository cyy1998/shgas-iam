import antfu from "@antfu/eslint-config";
import { doubleQuoteStylistic, maxLengthRule } from "../src/shared.ts";

export default antfu({
  e18e: false,
  formatters: false,
  imports: false,
  jsdoc: false,
  jsonc: false,
  jsx: false,
  markdown: false,
  node: false,
  perfectionist: false,
  pnpm: false,
  regexp: false,
  stylistic: doubleQuoteStylistic,
  test: false,
  toml: false,
  typescript: true,
  unicorn: false,
  yaml: false,
  rules: {
    "max-len": maxLengthRule,
  },
});
