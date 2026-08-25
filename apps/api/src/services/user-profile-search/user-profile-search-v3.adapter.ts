import type { UserQueryDto } from "@api/services/user/user.type";
import type {
  V3UserProfileFilter,
  V3UserProfileQueryService,
} from "@iam/user-profile-read-model/v3";
import type { UserProfileSearchPort } from "./user-profile-search.port";
import { UserDtoSchema } from "@iam/domain/user";
import { V3UserProfileFilterValidationError } from "@iam/user-profile-read-model/v3";

type V3EmploymentFilter = Extract<
  V3UserProfileFilter,
  { exists: { path: "employments" } }
>["exists"]["where"];

type V3OrganizationPathFilter = Extract<
  V3EmploymentFilter,
  { exists: { path: "organization.path" } }
>["exists"]["where"];

export function createV3UserProfileSearchAdapter(
  query: Pick<V3UserProfileQueryService, "search" | "searchBase">,
) {
  return {
    searchDsl: async (input: unknown) => await query.searchBase(input),
    searchLegacyUsers: async (input: UserQueryDto) => {
      const filter = compileLegacyUserSearchFilter(input);
      const details = await query.search({ filter });
      return details.map(detail => UserDtoSchema.parse(detail));
    },
  } satisfies UserProfileSearchPort;
}

function compileLegacyUserSearchFilter(
  input: UserQueryDto,
): V3UserProfileFilter {
  const rootConditions: V3UserProfileFilter[] = [];
  addOptionalCondition(rootConditions, input.usernames, value => ({
    field: "user.username",
    op: "in",
    value,
  } satisfies V3UserProfileFilter));
  addOptionalCondition(rootConditions, input.names, value => ({
    field: "user.name",
    op: "in",
    value,
  } satisfies V3UserProfileFilter));
  addOptionalCondition(rootConditions, input.phones, value => ({
    field: "user.mobile",
    op: "in",
    value,
  } satisfies V3UserProfileFilter));
  addOptionalCondition(rootConditions, input.wxIds, value => ({
    field: "user.wxId",
    op: "in",
    value,
  } satisfies V3UserProfileFilter));

  const employmentConditions: V3EmploymentFilter[] = [];
  addOptionalCondition(employmentConditions, input.positionCodes, value => ({
    field: "position.code",
    op: "in",
    value,
  } satisfies V3EmploymentFilter));
  addOptionalCondition(employmentConditions, input.roleCodes, value => ({
    field: "roles",
    op: "containsAny",
    value,
  } satisfies V3EmploymentFilter));

  const organizationPathConditions: V3OrganizationPathFilter[] = [];
  addOptionalCondition(
    organizationPathConditions,
    input.ancestorOrgCodes,
    value => ({ field: "code", op: "in", value } satisfies V3OrganizationPathFilter),
  );
  addOptionalCondition(
    organizationPathConditions,
    input.ancestorOrgDepths,
    value => ({
      field: "distanceToTarget",
      op: "in",
      value,
    } satisfies V3OrganizationPathFilter),
  );
  const organizationPathFilter = combineWithAnd(
    organizationPathConditions,
    and => ({ and } satisfies V3OrganizationPathFilter),
  );
  if (organizationPathFilter !== undefined) {
    employmentConditions.push({
      exists: {
        path: "organization.path",
        where: organizationPathFilter,
      },
    });
  }

  const employmentFilter = combineWithAnd(
    employmentConditions,
    and => ({ and } satisfies V3EmploymentFilter),
  );
  if (employmentFilter !== undefined) {
    rootConditions.push({
      exists: {
        path: "employments",
        where: employmentFilter,
      },
    });
  }

  const filter = combineWithAnd(
    rootConditions,
    and => ({ and } satisfies V3UserProfileFilter),
  );
  if (filter === undefined)
    throw new V3UserProfileFilterValidationError();
  return filter;
}

function addOptionalCondition<Value, Filter>(
  conditions: Filter[],
  value: Value | undefined,
  createCondition: (value: Value) => Filter,
) {
  if (value === undefined)
    return;
  conditions.push(createCondition(value));
}

function combineWithAnd<Filter>(
  conditions: Filter[],
  createAnd: (conditions: Filter[]) => Filter,
): Filter | undefined {
  if (conditions.length === 0)
    return undefined;
  if (conditions.length === 1)
    return conditions[0];
  return createAnd(conditions);
}
