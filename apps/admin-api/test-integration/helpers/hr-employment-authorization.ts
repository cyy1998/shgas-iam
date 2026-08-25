import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { HrAdministrationScope } from "@admin-api/services/admin-authorization/hr-administration-scope.resolver";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";

const hrActor = {
  userId: 7,
  username: "hradmin",
  roles: ["iam:hr-admin"],
} as const;

export async function createTestHrEmploymentAuthorization(input: {
  organizationIds: readonly number[];
  rootOrganizationIds?: readonly number[];
  denyMutation?: AdminEmploymentAuthorization["denyMutation"];
}) {
  const scope: HrAdministrationScope = {
    rootOrganizationIds: input.rootOrganizationIds ?? input.organizationIds,
    organizationIds: input.organizationIds,
  };
  const policy = createAdminAuthorizationPolicy({
    hrAdministrationScopeResolver: { resolveForActor: async () => scope },
    logger: { warn: () => undefined },
  });
  const authorization = await policy.getEmploymentAuthorization(hrActor, scope);
  return input.denyMutation === undefined
    ? authorization
    : { ...authorization, denyMutation: input.denyMutation };
}
