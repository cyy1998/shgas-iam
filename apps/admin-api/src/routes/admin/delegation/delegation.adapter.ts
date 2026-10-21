import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { getAdminAuditActor, getAdminAuditRequestContext } from "@admin-api/services/audit/audit.context";
import { router } from "@iam/api-core/trpc";
import { DelegationSearchSchema, type DelegationService, DelegationUpdateSchema } from "@iam/delegation";
import { z } from "zod";
import {
  AdminDelegationCreateSchema,
  DelegationClientOptionSchema,
  DelegationIdSchema,
  DelegationOrganizationOptionSchema,
  DelegationSelectorQuerySchema,
  DelegationUserOptionSchema,
  toAdminDelegationVo,
} from "./delegation.schema";
import type { DelegationRouteHandler } from "./delegation.type";

export function createDelegationAdapter(deps: { delegationService: DelegationService }) {
  const scope = { kind: "all" } as const;
  const search = defineAdminApiQueryOperation({
    operationId: "admin.delegation.search",
    input: DelegationSearchSchema,
    restInput: (c) => DelegationSearchSchema.parse(c.req.valid("json")),
    handler: async (input) => (await deps.delegationService.search(input, scope)).map(toAdminDelegationVo),
  });
  const create = defineAdminApiMutationOperation({
    operationId: "admin.delegation.create",
    input: AdminDelegationCreateSchema,
    restInput: (c) => AdminDelegationCreateSchema.parse(c.req.valid("json")),
    handler: async (input, { hono }) => {
      const outcome = await deps.delegationService.create(input, scope, {
        actionPrefix: "admin",
        actor: getAdminAuditActor(hono),
        requestContext: getAdminAuditRequestContext(hono),
      });
      return { ...outcome, result: toAdminDelegationVo(outcome.result) };
    },
  });
  const update = defineAdminApiMutationOperation({
    operationId: "admin.delegation.update",
    input: z.object({ id: z.number().int().positive(), data: DelegationUpdateSchema }).strict(),
    restInput: (c) => ({
      ...DelegationIdSchema.parse(c.req.valid("param")),
      data: DelegationUpdateSchema.parse(c.req.valid("json")),
    }),
    handler: async ({ id, data }, { hono }) => {
      const outcome = await deps.delegationService.update(id, data, scope, {
        actionPrefix: "admin",
        actor: getAdminAuditActor(hono),
        requestContext: getAdminAuditRequestContext(hono),
      });
      return { changed: outcome.changed, result: null };
    },
  });
  const users = defineAdminApiQueryOperation({
    operationId: "admin.delegation.selectUsers",
    input: DelegationSelectorQuerySchema,
    restInput: (c) => DelegationSelectorQuerySchema.parse(c.req.valid("json")),
    handler: async (input) =>
      (await deps.delegationService.selectUsers(input)).map((row) => DelegationUserOptionSchema.parse(row)),
  });
  const clients = defineAdminApiQueryOperation({
    operationId: "admin.delegation.selectClients",
    input: DelegationSelectorQuerySchema,
    restInput: (c) => DelegationSelectorQuerySchema.parse(c.req.valid("json")),
    handler: async (input) =>
      (await deps.delegationService.selectClients(input)).map((row) => DelegationClientOptionSchema.parse(row)),
  });
  const organizations = defineAdminApiQueryOperation({
    operationId: "admin.delegation.selectOrganizations",
    input: DelegationSelectorQuerySchema,
    restInput: (c) => DelegationSelectorQuerySchema.parse(c.req.valid("json")),
    handler: async (input) =>
      (await deps.delegationService.selectOrganizations(input)).map((row) =>
        DelegationOrganizationOptionSchema.parse(row),
      ),
  });
  return {
    delegationAdminRouter: router({
      search: search.toTRPC(),
      create: create.toTRPC(),
      update: update.toTRPC(),
      selectUsers: users.toTRPC(),
      selectClients: clients.toTRPC(),
      selectOrganizations: organizations.toTRPC(),
    }),
    search: search.toHandler<DelegationRouteHandler<"delegationSearch">>(),
    create: create.toHandler<DelegationRouteHandler<"delegationCreate">>(),
    update: update.toHandler<DelegationRouteHandler<"delegationUpdate">>(),
    selectUsers: users.toHandler<DelegationRouteHandler<"delegationUsers">>(),
    selectClients: clients.toHandler<DelegationRouteHandler<"delegationClients">>(),
    selectOrganizations: organizations.toHandler<DelegationRouteHandler<"delegationOrganizations">>(),
  };
}
export type DelegationAdapter = ReturnType<typeof createDelegationAdapter>;
