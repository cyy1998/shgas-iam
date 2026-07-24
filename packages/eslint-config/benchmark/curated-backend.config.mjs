import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import-lite";
import nodePlugin from "eslint-plugin-n";
import unusedImports from "eslint-plugin-unused-imports";
import { maxLengthRule } from "../src/shared.ts";

export default [
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "import": importPlugin,
      "node": nodePlugin,
      "unused-imports": unusedImports,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "max-len": maxLengthRule,
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-unreachable": "error",
      "unused-imports/no-unused-imports": "error",
    },
  },
];
