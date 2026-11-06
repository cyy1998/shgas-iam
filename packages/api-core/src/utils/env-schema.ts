import { z } from "zod";

export function booleanString(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === "") return defaultValue;
      return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    });
}

export function optionalNonEmptyString() {
  return z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined);
}
