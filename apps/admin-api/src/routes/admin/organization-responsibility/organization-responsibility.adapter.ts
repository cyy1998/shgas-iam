import type { AdminApiOperationContext } from "@admin-api/lib/admin-api-adapter";
import type { AdminOperationId } from "@admin-api/services/admin-authorization/admin-operation.registry";
import type { OrganizationResponsibilityService } from "@admin-api/services/organization-responsibility/organization-responsibility.service";
import type { CreateOrganizationResponsibilityAssignmentUseCase } from "@admin-api/use-cases/organization-responsibility/create-assignment/create-assignment.use-case";
import type { ManageOrganizationResponsibilityAssignmentLifecycleUseCase } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.use-case";
import type { OrganizationResponsibilityAssignmentLifecycleCommand as OrganizationResponsibilityAssignmentLifecycleCommandType } from "@iam/contracts";
import type { OrganizationResponsibilityRouteHandler } from "./organization-responsibility.type";
import {
  defineAdminApiMutationOperation,
  defineAdminApiQueryOperation,
} from "@admin-api/lib/admin-api-adapter";
import { resolveAdminOrganizationResponsibilityAuthorizationForContext } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { ADMIN_ORGANIZATION_RESPONSIBILITY_LIFECYCLE_OPERATION_IDS } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import { resolveAdminAuditContext } from "@admin-api/services/audit/audit.context";
import {
  OrganizationResponsibilityAssignmentCreateDtoSchema,
  OrganizationResponsibilityAssignmentListQuerySchema,
  OrganizationResponsibilityAssignmentSearchQuerySchema,
} from "@admin-api/services/organization-responsibility/organization-responsibility.schema";
import { router } from "@iam/api-core/trpc";
import {
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,

} from "@iam/contracts";
import { z } from "zod";

export interface CreateOrganizationResponsibilityAdapterDeps {
  createAssignment: CreateOrganizationResponsibilityAssignmentUseCase;
  manageAssignmentLifecycle: ManageOrganizationResponsibilityAssignmentLifecycleUseCase;
  service: OrganizationResponsibilityService;
}

export function createOrganizationResponsibilityAdapter(
  deps: CreateOrganizationResponsibilityAdapterDeps,
) {
  async function resolveAuthorization(
    context: AdminApiOperationContext,
    operationId: AdminOperationId,
  ) {
    return await resolveAdminOrganizationResponsibilityAuthorizationForContext(
      context.hono,
      operationId,
    );
  }

  const listTypes = defineAdminApiQueryOperation({
    operationId: "admin.organizationResponsibility.listTypes",
    input: z.strictObject({}),
    restInput: () => ({}),
    handler: async (_input, context) => {
      await resolveAuthorization(
        context,
        "admin.organizationResponsibility.listTypes",
      );
      return ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(entry => ({
        ...entry,
      }));
    },
  });

  const listAssignments = defineAdminApiQueryOperation({
    operationId: "admin.organizationResponsibility.listAssignments",
    input: OrganizationResponsibilityAssignmentListQuerySchema.extend({
      orgCode: z.string(),
    }),
    restInput: (c) => {
      const query = c.req.valid("query") as z.infer<
        typeof OrganizationResponsibilityAssignmentListQuerySchema
      >;
      return {
        orgCode: (c.req.valid("param") as { orgCode: string }).orgCode,
        ...query,
      };
    },
    handler: async (input, context) => await deps.service.listAssignments(
      input,
      await resolveAuthorization(
        context,
        "admin.organizationResponsibility.listAssignments",
      ),
    ),
  });

  const searchAssignments = defineAdminApiQueryOperation({
    operationId: "admin.organizationResponsibility.searchAssignments",
    input: OrganizationResponsibilityAssignmentSearchQuerySchema,
    restInput: c =>
      c.req.valid("query") as z.infer<
        typeof OrganizationResponsibilityAssignmentSearchQuerySchema
      >,
    handler: async (input, context) => await deps.service.searchAssignments(
      input,
      await resolveAuthorization(
        context,
        "admin.organizationResponsibility.searchAssignments",
      ),
    ),
  });

  const scopedDetailAssignment = defineAdminApiQueryOperation({
    operationId: "admin.organizationResponsibility.scopedDetailAssignment",
    input: z.strictObject({
      orgCode: z.string(),
      id: z.number().int().positive(),
    }),
    restInput: c => c.req.valid("param") as { orgCode: string; id: number },
    handler: async (input, context) => await deps.service.detailAssignment(
      input,
      await resolveAuthorization(
        context,
        "admin.organizationResponsibility.scopedDetailAssignment",
      ),
    ),
  });

  const detailAssignment = defineAdminApiQueryOperation({
    operationId: "admin.organizationResponsibility.detailAssignment",
    input: z.strictObject({
      orgCode: z.string().optional(),
      id: z.number().int().positive(),
    }),
    restInput: c => c.req.valid("param") as { id: number },
    handler: async (input, context) => await deps.service.detailAssignment(
      input,
      await resolveAuthorization(
        context,
        "admin.organizationResponsibility.detailAssignment",
      ),
    ),
  });

  const createAssignment = defineAdminApiMutationOperation({
    operationId: "admin.organizationResponsibility.createAssignment",
    input: OrganizationResponsibilityAssignmentCreateDtoSchema.extend({
      orgCode: z.string(),
    }),
    restInput: c => ({
      orgCode: (c.req.valid("param") as { orgCode: string }).orgCode,
      ...(c.req.valid("json") as z.infer<
        typeof OrganizationResponsibilityAssignmentCreateDtoSchema
      >),
    }),
    handler: async ({ orgCode, ...input }, context) =>
      deps.createAssignment.execute(
        {
          ...input,
          targetOrganizationCode: orgCode,
        },
        {
          auditContext: resolveAdminAuditContext(context),
          authorization: await resolveAuthorization(
            context,
            "admin.organizationResponsibility.createAssignment",
          ),
        },
      ),
  });

  function createLifecycleOperation(
    command: OrganizationResponsibilityAssignmentLifecycleCommandType,
    operationId: AdminOperationId,
  ) {
    return defineAdminApiMutationOperation({
      operationId,
      input: z.strictObject({ id: z.number().int().positive() }),
      restInput: c => c.req.valid("param") as { id: number },
      handler: async (input, context) =>
        deps.manageAssignmentLifecycle.execute(
          { ...input, command },
          {
            auditContext: resolveAdminAuditContext(context),
            authorization: await resolveAuthorization(context, operationId),
          },
        ),
    });
  }

  const pauseAssignment = createLifecycleOperation(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Pause,
    ADMIN_ORGANIZATION_RESPONSIBILITY_LIFECYCLE_OPERATION_IDS.pause,
  );
  const resumeAssignment = createLifecycleOperation(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume,
    ADMIN_ORGANIZATION_RESPONSIBILITY_LIFECYCLE_OPERATION_IDS.resume,
  );
  const endAssignment = createLifecycleOperation(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End,
    ADMIN_ORGANIZATION_RESPONSIBILITY_LIFECYCLE_OPERATION_IDS.end,
  );

  return {
    organizationResponsibilityAdminRouter: router({
      listTypes: listTypes.toTRPC(),
      listAssignments: listAssignments.toTRPC(),
      searchAssignments: searchAssignments.toTRPC(),
      detailAssignment: detailAssignment.toTRPC(),
      createAssignment: createAssignment.toTRPC(),
      pauseAssignment: pauseAssignment.toTRPC(),
      resumeAssignment: resumeAssignment.toTRPC(),
      endAssignment: endAssignment.toTRPC(),
    }),
    organizationResponsibilityAssignmentCreate:
      createAssignment.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityAssignmentCreate">
      >(),
    organizationResponsibilityAssignmentPause:
      pauseAssignment.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityAssignmentPause">
      >(),
    organizationResponsibilityAssignmentResume:
      resumeAssignment.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityAssignmentResume">
      >(),
    organizationResponsibilityAssignmentEnd:
      endAssignment.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityAssignmentEnd">
      >(),
    organizationResponsibilityAssignmentDetail:
      scopedDetailAssignment.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityAssignmentDetail">
      >(),
    organizationResponsibilityGlobalAssignmentDetail:
      detailAssignment.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityGlobalAssignmentDetail">
      >(),
    organizationResponsibilityAssignmentsList:
      listAssignments.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityAssignmentsList">
      >(),
    organizationResponsibilityAssignmentsSearch:
      searchAssignments.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityAssignmentsSearch">
      >(),
    organizationResponsibilityTypesList:
      listTypes.toHandler<
        OrganizationResponsibilityRouteHandler<"organizationResponsibilityTypesList">
      >(),
  };
}

export type OrganizationResponsibilityAdapter = ReturnType<
  typeof createOrganizationResponsibilityAdapter
>;
