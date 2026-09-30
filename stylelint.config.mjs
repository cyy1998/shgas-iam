export default {
  ignoreFiles: [
    ".agents/skills/**",
    ".codex/skills/**",
    ".scratch/**",
    ".sandcastle/{auth,dependencies,locks,logs,patches,resources,worktrees}/**",
    "apps/admin-api/static/**",
    "apps/api/static/**",
    "apps/sso/public/cap/**",
    "docs/reviews/**",
    "openspec/**",
    "packages/db/src/migrations/**",
    "**/{.cache,.turbo,.umi,.umi-production,.umi-test,coverage,dist,generated,node_modules,out,playwright-report,test-results}/**",
  ],
  extends: ["stylelint-config-standard"],
  customSyntax: "postcss-less",
  rules: {
    "color-function-alias-notation": null,
    "color-function-notation": null,
    "media-feature-range-notation": null,
  },
};
