export function createFrontendEslintConfig(antfu) {
  return antfu(
    {
      formatters: false,
      react: true,
      stylistic: false,
      typescript: true,
      ignores: [
        ".umi/**",
        ".umi-production/**",
        "coverage/**",
        "dist/**",
        "src/.umi/**",
        "src/.umi-production/**",
      ],
    },
    {
      rules: {
        // Prettier and its organize-imports plugin own frontend formatting.
        "import/consistent-type-specifier-style": "off",
        "perfectionist/sort-imports": "off",
        "perfectionist/sort-named-imports": "off",
        "ts/consistent-type-definitions": ["error", "type"],
        // Umi replaces process.env references while building browser bundles.
        "node/prefer-global/process": "off",
        // Keep mixed component/helper exports visible without blocking Umi HMR.
        "react-refresh/only-export-components": "warn",
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
        // Ambient declarations may need interfaces for declaration merging.
        "ts/consistent-type-definitions": "off",
      },
    },
  );
}
