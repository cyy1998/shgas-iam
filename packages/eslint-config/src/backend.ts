import type { PresetOptions } from "./shared.ts";
import antfu from "@antfu/eslint-config";
import { doubleQuoteStylistic, maxLengthRule, mergePresetOptions } from "./shared.ts";

const backendDefaults = {
  formatters: true,
  stylistic: doubleQuoteStylistic,
  rules: {
    "max-len": maxLengthRule,
  },
} satisfies PresetOptions;

const serviceRules: NonNullable<PresetOptions["rules"]> = {
  "no-console": "warn",
  "node/prefer-global/process": "off",
  "node/prefer-global/buffer": "off",
  "ts/consistent-type-definitions": "off",
};

export function createBackendConfig(options: PresetOptions = {}) {
  return antfu(mergePresetOptions(backendDefaults, options));
}

export function createServiceBackendConfig(options: PresetOptions = {}) {
  return createBackendConfig(mergePresetOptions({ rules: serviceRules }, options));
}
