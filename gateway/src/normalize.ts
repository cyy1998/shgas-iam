import type { ResourceKind } from "./types";
import { isRecord } from "./manifest";
import { getDefinition } from "./resources";

export function normalizeForCompare(kind: ResourceKind, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => normalizeForCompare(kind, item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const compare = getDefinition(kind).compare;
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (compare.ignoreFields.includes(key) || child === undefined) {
      continue;
    }
    if (Object.is(compare.defaultValues[key], child)) {
      continue;
    }
    normalized[key] = normalizeForCompare(kind, child);
  }

  return normalized;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sortKeys(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortKeys(value[key])]),
  );
}
