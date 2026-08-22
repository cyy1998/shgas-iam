import type { OrganizationResponsibilityRepository } from "./organization-responsibility.repository";
import type {
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
  async function searchAssignments(input: AssignmentSearchInput) {
    const rows = await deps.repository.listAssignmentsForAdmin({
      ...input,
      lifecycle: input.lifecycle ?? "open",
      cursorId: input.cursor === undefined ? undefined : Number(input.cursor),
      limit: input.limit + 1,
    });
    const hasNext = rows.length > input.limit;
    const items = hasNext ? rows.slice(0, input.limit) : rows;
    return {
      items,
      nextCursor: hasNext ? String(items.at(-1)!.id) : null,
    };
  }

  return {
    async listAssignments(
      input: Omit<AssignmentSearchInput, "targetOrganizationCode"> & {
        orgCode: string;
      },
    ) {
      const { orgCode, ...filters } = input;
      return await searchAssignments({
        ...filters,
        targetOrganizationCode: orgCode,
      });
    },
    searchAssignments,
    async detailAssignment(input: { orgCode?: string; id: number }) {
      const assignment
        = await deps.repository.getAssignmentDetailForAdmin(input);
      if (assignment === null)
        throw new OrganizationResponsibilityAssignmentNotFoundError();
      return assignment;
    },
  };
}

export type OrganizationResponsibilityService = ReturnType<
  typeof createOrganizationResponsibilityService
>;
