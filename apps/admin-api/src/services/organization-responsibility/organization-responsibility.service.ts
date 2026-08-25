import type { AdminOrganizationResponsibilityAuthorization } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import type { OrganizationResponsibilityRepository } from "./organization-responsibility.repository";
import type {
  OrganizationResponsibilityAssignmentData,
  OrganizationResponsibilityAssignmentLifecycle,
  OrganizationResponsibilityAssignmentSearchQuery,
} from "./organization-responsibility.schema";
import { OrganizationResponsibilityAssignmentNotFoundError } from "@iam/domain/organization-responsibility";

export interface CreateOrganizationResponsibilityServiceDeps {
  repository: Pick<
    OrganizationResponsibilityRepository,
    "getAssignmentDetailForAdmin" | "listAssignmentsForAdmin"
  >;
}

type AssignmentSearchInput = Omit<
  OrganizationResponsibilityAssignmentSearchQuery,
  "lifecycle"
> & {
  lifecycle?: OrganizationResponsibilityAssignmentLifecycle;
};

export function createOrganizationResponsibilityService(
  deps: CreateOrganizationResponsibilityServiceDeps,
) {
  function withAllowedActions(
    assignment: OrganizationResponsibilityAssignmentData,
    authorization: AdminOrganizationResponsibilityAuthorization,
  ) {
    return {
      ...assignment,
      allowedActions: authorization.getAllowedActions({
        status: assignment.status,
      }),
    };
  }

  async function searchAssignments(
    input: AssignmentSearchInput,
    authorization: AdminOrganizationResponsibilityAuthorization,
  ) {
    const rows = await deps.repository.listAssignmentsForAdmin({
      ...input,
      lifecycle: input.lifecycle ?? "open",
      cursorId: input.cursor === undefined ? undefined : Number(input.cursor),
      limit: input.limit + 1,
    }, authorization.readScope);
    const hasNext = rows.length > input.limit;
    const items = hasNext ? rows.slice(0, input.limit) : rows;
    return {
      items: items.map(assignment => withAllowedActions(
        assignment,
        authorization,
      )),
      nextCursor: hasNext ? String(items.at(-1)!.id) : null,
    };
  }

  return {
    async listAssignments(
      input: Omit<AssignmentSearchInput, "targetOrganizationCode"> & {
        orgCode: string;
      },
      authorization: AdminOrganizationResponsibilityAuthorization,
    ) {
      const { orgCode, ...filters } = input;
      return await searchAssignments({
        ...filters,
        targetOrganizationCode: orgCode,
      }, authorization);
    },
    searchAssignments,
    async detailAssignment(
      input: { orgCode?: string; id: number },
      authorization: AdminOrganizationResponsibilityAuthorization,
    ) {
      const assignment
        = await deps.repository.getAssignmentDetailForAdmin(
          input,
          authorization.readScope,
        );
      if (assignment === null)
        throw new OrganizationResponsibilityAssignmentNotFoundError();
      return withAllowedActions(assignment, authorization);
    },
  };
}

export type OrganizationResponsibilityService = ReturnType<
  typeof createOrganizationResponsibilityService
>;
