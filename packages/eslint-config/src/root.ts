import type { PresetOptions } from "./shared.ts";
import antfu from "@antfu/eslint-config";
import { doubleQuoteStylistic, maxLengthRule, mergePresetOptions } from "./shared.ts";

const rootDefaults = {
  formatters: true,
  typescript: true,
  stylistic: doubleQuoteStylistic,
  rules: {
    "no-console": "off",
    "node/prefer-global/process": "off",
    "ts/consistent-type-definitions": "off",
    "max-len": maxLengthRule,
  },
} satisfies PresetOptions;

export function createRootConfig(options: PresetOptions = {}) {
  return antfu(mergePresetOptions(rootDefaults, options));
}
