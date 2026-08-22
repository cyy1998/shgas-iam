import type { RelationsConfig, RelationsHelper } from "../types";
import { clientsRelations } from "./clients";
import { delegationDetailsRelations } from "./delegation-details";
import { employmentsRelations } from "./employments";
import { organizationClosuresRelations } from "./organization-closures";
import { organizationResponsibilityAssignmentsRelations } from "./organization-responsibility-assignments";
import { organizationsRelations } from "./organizations";
import { positionsRelations } from "./positions";
import { privilegeDelegationsRelations } from "./privilege-delegations";
import { privilegesRelations } from "./privileges";
import { roleAssignmentsRelations } from "./role-assignments";
import { rolePrivilegesRelations } from "./role-privileges";
import { rolesRelations } from "./roles";
import { userProfileDirtyRelations } from "./user-profile-dirty";
import { userProfilesRelations } from "./user-profiles";
import { usersRelations } from "./users";

export function coreRelations(r: RelationsHelper) {
  return {
    ...clientsRelations(r),
    ...delegationDetailsRelations(r),
    ...employmentsRelations(r),
    ...organizationClosuresRelations(r),
    ...organizationResponsibilityAssignmentsRelations(r),
    ...organizationsRelations(r),
    ...positionsRelations(r),
    ...privilegeDelegationsRelations(r),
    ...privilegesRelations(r),
    ...roleAssignmentsRelations(r),
    ...rolePrivilegesRelations(r),
    ...rolesRelations(r),
    ...userProfileDirtyRelations(r),
    ...userProfilesRelations(r),
    ...usersRelations(r),
  } satisfies RelationsConfig;
}
