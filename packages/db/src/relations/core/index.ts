import type { RelationsConfig, RelationsHelper } from "../types";
import { clientsRelations } from "./clients";
import { delegationDetailsRelations } from "./delegation-details";
import { employmentRolesRelations } from "./employment-roles";
import { employmentsRelations } from "./employments";
import { loginLogsRelations } from "./login-logs";
import { organizationClosuresRelations } from "./organization-closures";
import { organizationRolesRelations } from "./organization-roles";
import { organizationsRelations } from "./organizations";
import { positionRolesRelations } from "./position-roles";
import { positionsRelations } from "./positions";
import { privilegeDelegationsRelations } from "./privilege-delegations";
import { privilegesRelations } from "./privileges";
import { rolePrivilegesRelations } from "./role-privileges";
import { rolesRelations } from "./roles";
import { usersRelations } from "./users";

export function coreRelations(r: RelationsHelper) {
  return {
    ...clientsRelations(r),
    ...delegationDetailsRelations(r),
    ...employmentRolesRelations(r),
    ...employmentsRelations(r),
    ...loginLogsRelations(r),
    ...organizationClosuresRelations(r),
    ...organizationRolesRelations(r),
    ...organizationsRelations(r),
    ...positionRolesRelations(r),
    ...positionsRelations(r),
    ...privilegeDelegationsRelations(r),
    ...privilegesRelations(r),
    ...rolePrivilegesRelations(r),
    ...rolesRelations(r),
    ...usersRelations(r),
  } satisfies RelationsConfig;
}
