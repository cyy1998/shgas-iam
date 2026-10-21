import type { RelationsConfig, RelationsHelper } from "../types";
import { clientDelegationsRelations } from "./client-delegations";
import { clientsRelations } from "./clients";
import { employmentsRelations } from "./employments";
import { organizationClosuresRelations } from "./organization-closures";
import { organizationResponsibilityAssignmentsRelations } from "./organization-responsibility-assignments";
import { organizationsRelations } from "./organizations";
import { positionsRelations } from "./positions";
import { roleAssignmentsRelations } from "./role-assignments";
import { rolesRelations } from "./roles";
import { userProfileDirtyRelations } from "./user-profile-dirty";
import { userProfilesRelations } from "./user-profiles";
import { usersRelations } from "./users";

export function coreRelations(r: RelationsHelper) {
  return {
    ...clientsRelations(r),
    ...employmentsRelations(r),
    ...organizationClosuresRelations(r),
    ...organizationResponsibilityAssignmentsRelations(r),
    ...organizationsRelations(r),
    ...positionsRelations(r),
    ...clientDelegationsRelations(r),
    ...roleAssignmentsRelations(r),
    ...rolesRelations(r),
    ...userProfileDirtyRelations(r),
    ...userProfilesRelations(r),
    ...usersRelations(r),
  } satisfies RelationsConfig;
}
