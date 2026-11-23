import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { buildAdminResourceAudit } from "@admin-api/services/audit/admin-resource-audit";
import { type AdminAuditContext, adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { ApiErrorCode } from "@iam/contracts";
import {
  type CustomAttributeDefinition,
  CustomAttributeDefinitionSchema,
  type CustomAttributeEntityType,
  type CustomAttributeOption,
} from "@iam/contracts/custom-attributes";
import { HttpStatusCodes } from "@iam/contracts/http";
import { BadRequestError, CustomError } from "@iam/runtime/errors";
import type { TransactionContext } from "@iam/unit-of-work";
import type {
  CustomAttributeDefinitionServiceDeps,
  CustomAttributeDefinitionTransactionPorts,
  DefinitionChanges,
  DefinitionRecord,
} from "./custom-attribute.port";
import type {
  DefinitionCreateInput,
  DefinitionKey,
  DefinitionSetEnabledInput,
  DefinitionUpdateInput,
} from "./custom-attribute.schema";

const optionChanges = (valueType: CustomAttributeDefinition["valueType"], options: CustomAttributeOption[]) => {
  if (valueType !== "single_select" && options.length > 0) throw new BadRequestError("仅单选属性可设置选项");
  const byCode = new Map(options.map((option) => [option.code, option]));
  if (byCode.size !== options.length) throw new BadRequestError("单选选项编码重复");
  return byCode;
};

function buildDefinitionAudit(
  operation: "create" | "update" | "enable" | "disable",
  definition: DefinitionRecord,
  context: AdminAuditContext,
  details: Record<string, unknown> = {},
) {
  return buildAdminResourceAudit(
    `admin.custom_attribute_definition.${operation}`,
    { type: "custom_attribute_definition", id: definition.id, code: definition.code },
    { entityType: definition.entityType, attributeCode: definition.code, ...details },
    context,
  );
}

export function createCustomAttributeDefinitionService(deps: CustomAttributeDefinitionServiceDeps) {
  const adminMutation = createAdminMutation(deps.uow);
  const locked = (
    key: DefinitionKey,
    context: AdminAuditContext,
    mutate: (
      tx: TransactionContext<CustomAttributeDefinitionTransactionPorts>,
      current: DefinitionRecord,
    ) => Promise<{ changed: boolean; result: null }>,
  ) =>
    adminMutation.locked(
      (tx) => tx.definitions.lock(key),
      () =>
        new CustomError("自定义属性定义不存在", {
          code: ApiErrorCode.NotFound,
          httpStatus: HttpStatusCodes.NOT_FOUND,
        }),
      mutate,
      adminAuditTransactionOptions(context),
    );

  return {
    async list(entityType: CustomAttributeEntityType) {
      const rows = await deps.reader.list(entityType);
      return rows.map((row) => CustomAttributeDefinitionSchema.parse(row));
    },

    async create(input: DefinitionCreateInput, context: AdminAuditContext) {
      const options = input.options ?? [];
      optionChanges(input.valueType, options);
      return await adminMutation.transaction(async (tx) => {
        const definition = await tx.definitions.insert({
          ...input,
          description: input.description ?? null,
          orderNum: input.orderNum ?? 0,
          enabled: true,
          options,
        });
        await tx.audit.recordAuditLog(buildDefinitionAudit("create", definition, context));
        return { changed: true, result: CustomAttributeDefinitionSchema.parse(definition) };
      }, adminAuditTransactionOptions(context));
    },

    async update(input: DefinitionUpdateInput, context: AdminAuditContext) {
      if (Object.keys(input.patch).length === 0) throw new BadRequestError("至少提交一个属性定义更新字段");
      return await locked(input, context, async (tx, current) => {
        const patch: DefinitionChanges = {};
        const { displayName, description, orderNum, options } = input.patch;
        if (displayName !== undefined && displayName !== current.displayName) patch.displayName = displayName;
        if (description !== undefined && description !== current.description) patch.description = description;
        if (orderNum !== undefined && orderNum !== current.orderNum) patch.orderNum = orderNum;
        const optionActions: { optionCode: string; action: "add" | "update" | "enable" | "disable" }[] = [];
        if (options !== undefined) {
          const next = new Map(current.options.map((option) => [option.code, option]));
          for (const [code, option] of optionChanges(current.valueType, options)) {
            const before = next.get(code);
            if (before?.displayName === option.displayName && before.enabled === option.enabled) continue;
            if (!before) optionActions.push({ optionCode: code, action: "add" });
            else {
              if (before.displayName !== option.displayName) optionActions.push({ optionCode: code, action: "update" });
              if (before.enabled !== option.enabled) {
                optionActions.push({ optionCode: code, action: option.enabled ? "enable" : "disable" });
              }
            }
            next.set(code, option);
          }
          if (optionActions.length > 0) patch.options = [...next.values()];
        }
        if (Object.keys(patch).length === 0) return { changed: false, result: null };
        const updated = await tx.definitions.update(current.id, patch);
        if (!updated) throw new Error("Locked Custom Attribute Definition update returned no row");
        await tx.audit.recordAuditLog(
          buildDefinitionAudit("update", updated, context, {
            fields: Object.keys(patch),
            ...(optionActions.length === 0 ? {} : { optionActions }),
          }),
        );
        return { changed: true, result: null };
      });
    },

    async setEnabled(input: DefinitionSetEnabledInput, context: AdminAuditContext) {
      return await locked(input, context, async (tx, current) => {
        const changed = current.enabled !== input.enabled;
        if (changed) {
          const updated = await tx.definitions.update(current.id, { enabled: input.enabled });
          if (!updated) throw new Error("Locked Custom Attribute Definition state update returned no row");
          const { entityType, code: attributeCode } = current;
          await tx.userDocumentInvalidation.recordChanges([
            { kind: "custom-attribute-definition", entityType, attributeCode },
          ]);
          if (entityType === "organization") {
            await tx.organizationDocumentInvalidation.recordChanges([
              { kind: "custom-attribute-definition", attributeCode },
            ]);
          }
        }
        await tx.audit.recordAuditLog(
          buildDefinitionAudit(input.enabled ? "enable" : "disable", current, context, {
            changed,
          }),
        );
        return { changed, result: null };
      });
    },
  };
}

export type CustomAttributeDefinitionService = ReturnType<typeof createCustomAttributeDefinitionService>;
