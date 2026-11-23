import type {
  CustomAttributeEntityType,
  CustomAttributePatch,
  CustomAttributeValues,
} from "@iam/contracts/custom-attributes";
import { CustomAttributeDefinitionSchema } from "@iam/contracts/custom-attributes";
import { applyCustomAttributePatch, selectActiveCustomAttributeValues } from "@iam/domain/custom-attributes";
import { BadRequestError } from "@iam/runtime/errors";
import type { CustomAttributeDefinitionReader, CustomAttributeValueWritePort } from "./custom-attribute.port";

export async function readActiveCustomAttributes(
  reader: CustomAttributeDefinitionReader,
  entityType: CustomAttributeEntityType,
  current: CustomAttributeValues,
) {
  const definitions = await reader.list(entityType, true);
  return {
    customAttributeDefinitions: definitions.map((definition) => CustomAttributeDefinitionSchema.parse(definition)),
    customAttributes: selectActiveCustomAttributeValues(current, definitions),
  };
}

export async function prepareCustomAttributeWrite(
  repository: CustomAttributeValueWritePort,
  entityType: CustomAttributeEntityType,
  current: CustomAttributeValues,
  patch?: CustomAttributePatch,
) {
  if (patch === undefined || Object.keys(patch).length === 0) return { values: current, changes: [] };
  const definitions = await repository.lockForValues(entityType, Object.keys(patch));
  const result = applyCustomAttributePatch(current, patch, definitions);
  if (!result.valid) throw new BadRequestError(`自定义属性 ${result.code} 不可填写或取值无效`);
  return result;
}
