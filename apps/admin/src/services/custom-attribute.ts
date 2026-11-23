import { apiClient } from "@admin/lib/api-client";
import { runAdminMutation } from "@admin/services/admin-mutation";
import type { AppRouter } from "@iam/admin-api/trpc";
import type { inferRouterInputs } from "@trpc/server";

type Inputs = inferRouterInputs<AppRouter>["admin"]["customAttribute"];

export function listCustomAttributeDefinitions(entityType: Inputs["list"]["entityType"]) {
  return apiClient.admin.customAttribute.list.query({ entityType });
}

export function createCustomAttributeDefinition(input: Inputs["create"]) {
  return runAdminMutation(() => apiClient.admin.customAttribute.create.mutate(input));
}

export function updateCustomAttributeDefinition(input: Inputs["update"]) {
  return runAdminMutation(() => apiClient.admin.customAttribute.update.mutate(input));
}

export function setCustomAttributeDefinitionEnabled(input: Inputs["setEnabled"]) {
  return runAdminMutation(() => apiClient.admin.customAttribute.setEnabled.mutate(input));
}
