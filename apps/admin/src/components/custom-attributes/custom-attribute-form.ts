import type { CustomAttributeDefinition, CustomAttributePatch } from "@iam/contracts/custom-attributes";

export function getCustomAttributeFormPatch(
  form: { isFieldTouched: (name: ["customAttributes", string]) => boolean },
  definitions: readonly CustomAttributeDefinition[],
  values?: CustomAttributePatch,
): CustomAttributePatch | undefined {
  const patch = Object.fromEntries(
    definitions
      .filter(({ enabled, code }) => enabled && form.isFieldTouched(["customAttributes", code]))
      .map(({ code }) => {
        const value = values?.[code];
        return [
          code,
          value === undefined || value === "" || (Array.isArray(value) && value.length === 0) ? null : value,
        ];
      }),
  );
  return Object.keys(patch).length > 0 ? patch : undefined;
}
