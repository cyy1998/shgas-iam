import type { OptionsConfig, Rules, StylisticConfig, TypedFlatConfigItem } from "@antfu/eslint-config";

export type PresetOptions = Omit<OptionsConfig, "ignores"> & {
  ignores?: string[];
  rules?: TypedFlatConfigItem["rules"];
};

export const maxLengthRule = [
  "warn",
  {
    code: 120,
    ignoreStrings: true,
    ignoreTemplateLiterals: true,
    ignoreRegExpLiterals: true,
    ignoreUrls: true,
  },
] satisfies NonNullable<Rules["max-len"]>;

export const doubleQuoteStylistic = {
  semi: true,
  quotes: "double",
} satisfies StylisticConfig;

export function mergePresetOptions(defaults: PresetOptions, options: PresetOptions): PresetOptions {
  return {
    ...defaults,
    ...options,
    ignores: [
      ...(defaults.ignores ?? []),
      ...(options.ignores ?? []),
    ],
    rules: {
      ...(defaults.rules ?? {}),
      ...(options.rules ?? {}),
    },
  };
}
