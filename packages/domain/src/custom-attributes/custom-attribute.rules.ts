import type {
  CustomAttributeDefinition,
  CustomAttributePatch,
  CustomAttributeValue,
  CustomAttributeValues,
} from "@iam/contracts/custom-attributes";
import { z } from "zod";

const DateSchema = z.iso.date();

type CustomAttributeChange = {
  attributeCode: string;
  action: "set" | "update" | "clear";
};

type PatchResult =
  | { valid: false; code: string }
  | { valid: true; values: CustomAttributeValues; changes: CustomAttributeChange[] };

function isSameValue(previous: CustomAttributeValue | undefined, value: CustomAttributeValue | null) {
  if (value === null) return previous === undefined;
  if (Array.isArray(value)) {
    return (
      Array.isArray(previous) && previous.length === value.length && previous.every((item, i) => item === value[i])
    );
  }
  return previous === value;
}

function isWritableValue(definition: CustomAttributeDefinition, value: CustomAttributeValue) {
  switch (definition.valueType) {
    case "text":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return DateSchema.safeParse(value).success;
    case "single_select":
      return definition.options.some((option) => option.enabled && option.code === value);
    case "text_list":
      return Array.isArray(value);
  }
}

export function applyCustomAttributePatch(
  current: CustomAttributeValues,
  patch: CustomAttributePatch,
  definitions: readonly CustomAttributeDefinition[],
): PatchResult {
  const definitionByCode = new Map(definitions.map((definition) => [definition.code, definition]));
  const values = { ...current };
  const changes: CustomAttributeChange[] = [];
  for (const [code, submitted] of Object.entries(patch)) {
    const definition = definitionByCode.get(code);
    if (!definition?.enabled) return { valid: false, code };
    const previous = Object.hasOwn(current, code) ? current[code] : undefined;
    const value = submitted === "" || (Array.isArray(submitted) && submitted.length === 0) ? null : submitted;
    if (isSameValue(previous, value)) continue;
    if (value === null) {
      delete values[code];
      changes.push({ attributeCode: code, action: "clear" });
      continue;
    }
    if (!isWritableValue(definition, value)) return { valid: false, code };
    values[code] = value;
    changes.push({ attributeCode: code, action: previous === undefined ? "set" : "update" });
  }
  return { valid: true, values, changes };
}

export function selectActiveCustomAttributeValues(
  current: CustomAttributeValues,
  definitions: readonly Pick<CustomAttributeDefinition, "code" | "enabled">[],
): CustomAttributeValues {
  return Object.fromEntries(
    definitions.flatMap(({ code, enabled }) => {
      const value = Object.hasOwn(current, code) ? current[code] : undefined;
      return enabled && value !== undefined ? [[code, value]] : [];
    }),
  );
}
