import type { PresetOptions } from "./shared.ts";
import antfu from "@antfu/eslint-config";

const frontendIgnores = [
  ".umi/**",
  ".umi-production/**",
  "coverage/**",
  "dist/**",
  "src/.umi/**",
  "src/.umi-production/**",
];

const frontendRules: NonNullable<PresetOptions["rules"]> = {
  "import/consistent-type-specifier-style": "off",
  "perfectionist/sort-imports": "off",
  "perfectionist/sort-named-imports": "off",
  "ts/consistent-type-definitions": ["error", "type"],
  "node/prefer-global/process": "off",
  "react-refresh/only-export-components": "warn",
};

export function createFrontendConfig(options: PresetOptions = {}) {
  return antfu(
    {
      formatters: false,
      react: true,
      stylistic: false,
      typescript: true,
      ...options,
      ignores: [...frontendIgnores, ...(options.ignores ?? [])],
    },
    {
      rules: {
        ...frontendRules,
        ...(options.rules ?? {}),
      },
    },
    {
      files: [
        "**/*.{test,spec}.{ts,tsx}",
        "test/**/*.{ts,tsx}",
        "e2e/**/*.{ts,tsx}",
      ],
      rules: {
        "react-refresh/only-export-components": "off",
        "test/prefer-lowercase-title": "off",
      },
    },
    {
      files: ["**/*.d.ts"],
      rules: {
        "ts/consistent-type-definitions": "off",
      },
    },
  );
}
