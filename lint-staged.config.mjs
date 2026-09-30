export default {
  "*.{cjs,css,cts,js,json,jsonc,jsx,mjs,mts,ts,tsx}": [
    "biome check --formatter-enabled=false --write --no-errors-on-unmatched",
    "biome format --write --no-errors-on-unmatched",
  ],
  "*.less": ["stylelint --allow-empty-input", "prettier --write"],
  "*.{md,yaml,yml}": "prettier --write",
};
