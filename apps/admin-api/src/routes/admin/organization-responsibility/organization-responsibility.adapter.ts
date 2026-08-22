import type { OrganizationResponsibilityService } from "@admin-api/services/organization-responsibility/organization-responsibility.service";
import type { CreateOrganizationResponsibilityAssignmentUseCase } from "@admin-api/use-cases/organization-responsibility/create-assignment/create-assignment.use-case";
import type { ManageOrganizationResponsibilityAssignmentLifecycleUseCase } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.use-case";
import type { OrganizationResponsibilityAssignmentLifecycleCommand as OrganizationResponsibilityAssignmentLifecycleCommandType } from "@iam/contracts";
import type { OrganizationResponsibilityRouteHandler } from "./organization-responsibility.type";
import {
  defineAdminApiMutationOperation,
  defineAdminApiQueryOperation,
} from "@admin-api/lib/admin-api-adapter";
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
  const listTypes = defineAdminApiQueryOperation({
    input: z.strictObject({}),
    restInput: () => ({}),
    handler: () =>
      ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(entry => ({ ...entry })),
  });

  const listAssignments = defineAdminApiQueryOperation({
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
    handler: input => deps.service.listAssignments(input),
  });

  const searchAssignments = defineAdminApiQueryOperation({
    input: OrganizationResponsibilityAssignmentSearchQuerySchema,
    restInput: c =>
      c.req.valid("query") as z.infer<
        typeof OrganizationResponsibilityAssignmentSearchQuerySchema
      >,
    handler: input => deps.service.searchAssignments(input),
  });

  const scopedDetailAssignment = defineAdminApiQueryOperation({
    input: z.strictObject({
      orgCode: z.string(),
      id: z.number().int().positive(),
    }),
    restInput: c => c.req.valid("param") as { orgCode: string; id: number },
    handler: input => deps.service.detailAssignment(input),
  });

  const detailAssignment = defineAdminApiQueryOperation({
    input: z.strictObject({
      orgCode: z.string().optional(),
      id: z.number().int().positive(),
    }),
    restInput: c => c.req.valid("param") as { id: number },
    handler: input => deps.service.detailAssignment(input),
  });

  const createAssignment = defineAdminApiMutationOperation({
    input: OrganizationResponsibilityAssignmentCreateDtoSchema.extend({
      orgCode: z.string(),
    }),
    restInput: c => ({
      orgCode: (c.req.valid("param") as { orgCode: string }).orgCode,
      ...(c.req.valid("json") as z.infer<
        typeof OrganizationResponsibilityAssignmentCreateDtoSchema
      >),
    }),
    handler: ({ orgCode, ...input }, context) =>
      deps.createAssignment.execute(
        {
          ...input,
          targetOrganizationCode: orgCode,
        },
        { auditContext: resolveAdminAuditContext(context) },
      ),
  });

  function createLifecycleOperation(
    command: OrganizationResponsibilityAssignmentLifecycleCommandType,
  ) {
    return defineAdminApiMutationOperation({
      input: z.strictObject({ id: z.number().int().positive() }),
      restInput: c => c.req.valid("param") as { id: number },
      handler: (input, context) =>
        deps.manageAssignmentLifecycle.execute(
          { ...input, command },
          { auditContext: resolveAdminAuditContext(context) },
        ),
    });
  }

  const pauseAssignment = createLifecycleOperation(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Pause,
  );
  const resumeAssignment = createLifecycleOperation(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume,
  );
  const endAssignment = createLifecycleOperation(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End,
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
